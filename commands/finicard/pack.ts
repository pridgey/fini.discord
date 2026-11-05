import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import {
  getCardDefinitions,
  toBattleCard,
} from "../../modules/finicards/cardStore";
import {
  getUnopenedFreePacks,
  markFreePackOpened,
  passOnSpecial,
} from "../../modules/finicards/freePacks";
import {
  rollGuaranteedTier,
  type LegendaryTier,
} from "../../modules/finicards/legendary";
import {
  MAX_PACKS_AT_ONCE,
  openPack,
  PACK_COST,
  PACK_SIZE,
  SET_PACK_COST,
} from "../../modules/finicards/packs";
import type { OwnedCard } from "../../modules/finicards/types";
import { presentPack } from "../../modules/finicards/packFlow";
import { createLog } from "../../modules/logger/logger";
import { addCoin, getUserBalance } from "../../modules/finicoin";
import { ADMIN_ID } from "../../utilities/discord/isAdmin";

const NO_LEGENDARY: Record<LegendaryTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

/** Pack odds under which a Legendary of `tier`, and only that tier, is certain. */
const certainTier = (tier: LegendaryTier): Record<LegendaryTier, number> => ({
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  [tier]: 1,
});

/* -------------------------------------------------------------------------- */
/* Packs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Logs a pack bought with the button under the last one. No command ran, so
 * nothing else would: the row is written the way `/finicard pack` writes its
 * own, so the two are counted together, and says which it was.
 *
 * Never rejects - it is not awaited, and an unhandled rejection takes the bot down.
 */
const logAgainPack = async (
  press: ButtonInteraction,
  { set, count }: PackOptions,
): Promise<void> => {
  try {
    const output = await press
      .fetchReply()
      .then((reply) => reply.content)
      .catch(() => "<no reply - interaction expired>");

    await createLog({
      command: "/finicard",
      input: `Command options:\n${[
        "subcommand: pack",
        `set: ${set ?? undefined}`,
        `count: ${count ?? undefined}`,
        "via: another pack button",
      ].join(",\n")}`,
      output,
      server_id: press.guild?.id || "unknown",
      user_id: press.user.id,
    });
  } catch (error) {
    console.error("Error logging a pack bought by button:", error);
  }
};

export type PackOptions = {
  set: number | null;
  /** How many packs to open at once. Absent, one. */
  count: number | null;
};

/**
 * Buys - or, for free packs, hands over - `count` packs and presents them, as
 * one run of cards, on the reply `interaction` has already deferred.
 *
 * Every pack is its own `openPack`: its own rarity per card, its own Secret
 * Art and Legendary roll, the server's population read fresh. So ten packs at
 * once hold exactly what ten packs one at a time would.
 *
 * Shared by `/finicard pack` and by the button at the end of a pack that buys
 * another of the same kind, which is why it takes its options rather than
 * reading them off a command.
 */
export const openPackFor = async (
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  { set, count }: PackOptions,
): Promise<void> => {
  const serverId = interaction.guildId ?? "unknown guild id";
  const serverName = interaction.guild?.name ?? "unknown guild name";
  const identifier = `${interaction.user.username}-${serverName}`;
  const packCount = Math.min(
    Math.max(Math.trunc(count ?? 1), 1),
    MAX_PACKS_AT_ONCE,
  );

  // Free packs the player is owed are opened before any they pay for.
  // They are packs of every set, so asking for one set buys packs instead.
  const freePacks = set
    ? []
    : await getUnopenedFreePacks(interaction.user.id, serverId).catch(() => []);
  const freeToOpen = freePacks.slice(0, packCount);
  const paidCount = packCount - freeToOpen.length;

  const price = set ? SET_PACK_COST : PACK_COST;
  const cost = paidCount * price;

  const balance = (await getUserBalance(interaction.user.id, serverId)) || 0;

  if (balance < cost) {
    const what = `${paidCount === 1 ? "A" : paidCount}${set ? ` Set ${set}` : ""} pack${paidCount === 1 ? "" : "s"}`;
    const free = freeToOpen.length
      ? ` (after your ${freeToOpen.length} free pack${freeToOpen.length === 1 ? "" : "s"})`
      : "";
    await interaction.editReply(
      `${what}${free} cost${paidCount === 1 ? "s" : ""} ${cost} fc and you have ${balance}.`,
    );
    return;
  }

  const definitions = (await getCardDefinitions()).filter(
    (definition) => !set || definition.set === set,
  );
  if (set && definitions.length === 0) {
    await interaction.editReply(`Set ${set} isn't out yet - soon!`);
    return;
  }
  if (definitions.length === 0) {
    await interaction.editReply(
      "The card pool is empty, so there is nothing to pull.",
    );
    return;
  }

  if (cost > 0) {
    await addCoin(
      "Reserve",
      serverId,
      cost,
      interaction.user.username,
      serverName,
      interaction.user.id,
    );
  }

  const pulls: OwnedCard[] = [];
  let shortfall = 0;
  let reimbursement = 0;
  let godPacks = 0;

  // One after another, never together: each pack reads the population the
  // last one left, so no card is handed out past its copies.
  for (let index = 0; index < packCount; index += 1) {
    const freePack = freeToOpen[index] ?? null;
    const opened = await openPack({
      userId: interaction.user.id,
      serverId,
      identifier,
      ...(set ? { set } : {}),
      // A free pack holds what was placed in it and rolls nothing special
      // by chance - no god pack either: each server's batch has exactly one
      // of each.
      ...(freePack
        ? {
            secretArtChance: freePack.special === "secret_art" ? 1 : 0,
            godPackChance: 0,
            legendaryOdds:
              freePack.special === "legendary"
                ? certainTier(rollGuaranteedTier(Math.random()))
                : NO_LEGENDARY,
          }
        : {}),
    });

    // Each pack reads the collection afresh, so a card an earlier pack in
    // this run gave is already not new.
    pulls.push(...opened.pulls);
    shortfall += opened.shortfall;
    if (opened.godPack) godPacks += 1;
    // Refund at the per-card rate, the way /booster-pack does - for a pack
    // that was paid for.
    if (!freePack && opened.shortfall > 0)
      reimbursement += Math.round((price / PACK_SIZE) * opened.shortfall);

    if (freePack) {
      await markFreePackOpened(freePack.id ?? "");
      // Placed but not there to give - no Secret Art left on the server,
      // say. Another unopened free pack takes it, so the server still
      // gets its one.
      const delivered =
        freePack.special === "secret_art"
          ? opened.pulls.some((pull) => pull.definition.secret_art)
          : freePack.special === "legendary"
            ? opened.pulls.some((pull) => !!pull.legendary)
            : true;
      if (!delivered && freePack.special) {
        await passOnSpecial(serverId, freePack.special, ADMIN_ID || undefined);
      }
    }
  }

  if (reimbursement > 0) {
    await addCoin(
      interaction.user.id,
      serverId,
      reimbursement,
      interaction.user.username,
      serverName,
      "Reserve",
    );
  }

  const cards = pulls.map((owned) => ({
    ...toBattleCard(owned),
    isNew: owned.isNew,
  }));
  const freeLeft = freePacks.length - freeToOpen.length;
  const packs = packCount === 1 ? "" : `${packCount} packs · `;
  const note = freeToOpen.length
    ? `${packs}${
        paidCount > 0
          ? `${freeToOpen.length} free + ${paidCount} bought · ${cost} fc`
          : "Free pack"
      } · ${freeLeft} more free to open`
    : set
      ? `${packs}Set ${set} · ${cost} fc`
      : packCount > 1
        ? `${packs}${cost} fc`
        : undefined;
  const pack = {
    cards,
    opener:
      (interaction.member as GuildMember | null)?.displayName ??
      interaction.user.displayName,
    cost,
    shortfall,
    reimbursement,
    packs: packCount,
    ...(godPacks ? { godPacks } : {}),
    ...(note ? { note } : {}),
  };

  // The sealed pack first, then its cards one at a time.
  const many = packCount > 1 ? `${packCount} ` : "";
  const plural = packCount > 1 ? "s" : "";
  await presentPack(interaction, pack, {
    label:
      freeLeft >= packCount
        ? `Open ${many || "another "}free pack${plural}`
        : freeLeft > 0
          ? `Open ${many || "another "}pack${plural} · ${freeLeft} free`
          : set
            ? `Buy ${many || "another "}Set ${set} pack${plural} · ${SET_PACK_COST * packCount} fc`
            : `Buy ${many || "another "}pack${plural} · ${PACK_COST * packCount} fc`,
    buy: (press) =>
      openPackFor(press, { set, count }).finally(() =>
        logAgainPack(press, { set, count }),
      ),
  });
};
