import { SlashCommandBuilder } from "@discordjs/builders";
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { addCoin, getUserBalance } from "../modules/finicoin";
import { createRateLimiter } from "../utilities/rateLimiter";
import {
  getHorseyNames,
  labelFor,
} from "../modules/games/horsey/horseyNames";
import {
  formatForm,
  getHorseyStats,
  recordRaceResult,
} from "../modules/games/horsey/horseyStats";
import {
  HORSE_COUNT,
  drawTrack,
  ordinal,
  payoutForPlace,
  placeOf,
  rankHorses,
  runRace,
  selectFrames,
} from "../modules/games/horsey/horseyUtilities";

/**
 * Discord's per-route buckets are dynamic and reported per response, so this is
 * a deliberately conservative floor rather than a documented constant: five
 * edits per five seconds to one message. discord.js queues against the real
 * bucket underneath; pacing here keeps us from handing it a burst to queue.
 *
 * Raising the budget or shortening the window is the knob for a faster race,
 * and the risk is 429s - which Discord answers with a temporary ban once enough
 * of them accumulate, not just a slower queue.
 */
const EDIT_BUDGET = 5;
const EDIT_WINDOW_MS = 5_000;

/**
 * Even spacing at exactly the sustainable rate.
 *
 * Derived rather than typed out so the two cannot drift apart: at
 * window/budget the limiter's window cap is never the binding constraint, so
 * frames land at a steady cadence instead of running fast and then stalling
 * when the budget empties.
 */
const FRAME_INTERVAL_MS = EDIT_WINDOW_MS / EDIT_BUDGET;

/**
 * How many frames of the race to show, including the finish.
 *
 * Five made the horses jump a third of the track between frames, which read as
 * a slideshow rather than a race. Ten is smooth enough to follow at the cost of
 * a longer race, since the interval above is already at the rate limit floor.
 */
const FRAME_COUNT = 10;

/**
 * When to stop animating and cut to the finish.
 *
 * If edits are being throttled harder than expected, the honest failure is a
 * race that ends early, not one that leaves someone watching horses for half a
 * minute after their coin has already moved.
 */
const MAX_ANIMATION_MS = FRAME_INTERVAL_MS * (FRAME_COUNT + 2);

export const data = new SlashCommandBuilder()
  .setName("horsey")
  .setDescription(
    "Bet on a horse race. 1st pays 3x your stake, 2nd 1.5x, 3rd gets half back.",
  )
  .addNumberOption((opt) =>
    opt
      .setName("bet")
      .setDescription("How much are you betting?")
      .setRequired(true)
      .setMinValue(1),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("horsey")
      .setDescription(`Which horsey are you backing? 1 to ${HORSE_COUNT}`)
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(HORSE_COUNT)
      // Not addChoices: choices are fixed when the command is registered, and
      // these names are per server. Autocomplete resolves per interaction.
      .setAutocomplete(true),
  );

/**
 * Offers this server's horses by name, filtered by whatever has been typed.
 *
 * The value is still the horse's number - the name is only a label - so a
 * server renaming its field can never change what a player actually backed.
 * @param interaction The autocomplete interaction to respond to
 */
export const autocomplete = async (interaction: AutocompleteInteraction) => {
  const names = await getHorseyNames(interaction.guildId ?? "unknown guild id");
  const typed = interaction.options.getFocused()?.toString().toLowerCase() ?? "";

  const options = names
    .map((_, index) => ({
      name: labelFor(names, index + 1),
      value: index + 1,
    }))
    .filter((option) => option.name.toLowerCase().includes(typed));

  await interaction.respond(options);
};

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  await interaction.deferReply();

  try {
    const userId = interaction.user.id;
    const guildId = interaction.guildId ?? "unknown guild id";
    const username = interaction.user.username;
    const guildName = interaction.guild?.name ?? "unknown guild name";

    const bet = Math.abs(
      parseFloat(interaction.options.get("bet")?.value?.toString() || "") || 0,
    );
    const pick = Number(interaction.options.get("horsey")?.value ?? 0);

    if (bet < 0.1) {
      await interaction.editReply("You cannot bet less than 0.10 finicoin");
      return;
    }

    // Discord enforces the range on the option, but a stale client or a
    // re-registered command can still send anything. The original game paid 3x
    // for a horse that wasn't running, so this is checked rather than trusted.
    if (!Number.isInteger(pick) || pick < 1 || pick > HORSE_COUNT) {
      await interaction.editReply(
        `You have to back a horsey between 1 and ${HORSE_COUNT}.`,
      );
      return;
    }

    const balance = await getUserBalance(userId, guildId);
    if (balance < bet) {
      await interaction.editReply(
        `You do not have enough Finicoin to complete this transaction\n**Current Balance:** ${balance.toLocaleString()}\n**Your Wager:** ${bet.toLocaleString()}`,
      );
      return;
    }

    // Take the stake before the race is shown, so an abandoned or failed
    // animation can't leave a free bet standing. addCoin is a transfer - this
    // moves the stake from the player to Reserve, same as /blackjack.
    await addCoin("Reserve", guildId, bet, "Reserve", guildName, userId);

    /*
     * The race is decided here, in full, before a single frame is drawn. The
     * animation below is a replay of a result that already exists - it cannot
     * change the outcome, and if it fails the payout still happens.
     */
    const names = await getHorseyNames(guildId);
    const horses = runRace();
    const place = placeOf(horses, pick);
    const returnMultiplier = payoutForPlace(place);
    const returned = bet * returnMultiplier;

    const frames = selectFrames(horses[0].positions.length, FRAME_COUNT);
    const limiter = createRateLimiter({
      budget: EDIT_BUDGET,
      windowMs: EDIT_WINDOW_MS,
      minIntervalMs: FRAME_INTERVAL_MS,
    });

    await limiter.acquire();
    await interaction.editReply("On your marks... Get set!");

    const animationDeadline = Date.now() + MAX_ANIMATION_MS;

    for (const [index, frame] of frames.entries()) {
      const isFinish = index === frames.length - 1;

      // The finish is never skipped - it is the frame that shows who won.
      if (!isFinish && Date.now() > animationDeadline) continue;

      await limiter.acquire();
      await interaction.editReply(drawTrack(horses, frame, names));
    }

    // Settle up. Anything the player didn't win back goes to the jackpot, so
    // the stake taken above is fully accounted for either way.
    if (returned > 0) {
      await addCoin(userId, guildId, returned, username, guildName, "Reserve");
    }
    if (returned < bet) {
      await addCoin(
        "Jackpot",
        guildId,
        bet - returned,
        "Jackpot",
        guildName,
        "Reserve",
      );
    }

    const places = rankHorses(horses);
    const winners = horses
      .filter((_, index) => places[index] === 1)
      .map((horse) => horse.id);

    await recordRaceResult(guildId, guildName, winners);

    const finishingOrder = horses
      .map((horse, index) => ({ id: horse.id, place: places[index] }))
      .sort((a, b) => a.place - b.place)
      .map((entry) => `${ordinal(entry.place)} — ${labelFor(names, entry.id)}`)
      .join("\n");

    const profit = returned - bet;
    const form = formatForm(await getHorseyStats(guildId), names);

    /*
     * The finished track leads the embed rather than being replaced by it.
     * The animation is gone the moment the result is posted, and the photo
     * finish is the part worth keeping - who edged out whom is only legible
     * from the track, not from a list of placings.
     */
    const finalTrack = drawTrack(horses, horses[0].positions.length - 1, names);

    const resultEmbed = new EmbedBuilder({
      color: profit >= 0 ? 0x57f287 : 0xed4245,
      title: "🏇 Horsey Race",
      description: [
        finalTrack,
        returnMultiplier > 0
          ? `**${labelFor(names, pick)}** came in ${ordinal(place)}! That pays ${returnMultiplier}x your stake.`
          : `**${labelFor(names, pick)}** came in ${ordinal(place)}. No payout this time.`,
      ].join("\n"),
      fields: [
        { name: "Finishing Order", value: finishingOrder, inline: false },
        { name: "Your Bet", value: bet.toLocaleString(), inline: true },
        {
          name: "Returned",
          value: returned.toLocaleString(),
          inline: true,
        },
        ...(form ? [{ name: "Form Guide", value: form, inline: false }] : []),
      ],
      footer: {
        text: `New Balance: ${(balance - bet + returned).toLocaleString()}`,
      },
    });

    await interaction.editReply({ content: "", embeds: [resultEmbed] });
  } catch (err) {
    console.error("Error running /horsey command", err);
    await interaction.editReply(
      "The horseys got spooked and the race was called off.",
    );
  } finally {
    logCommand();
  }
};
