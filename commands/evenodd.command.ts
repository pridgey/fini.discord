import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { runGame } from "../modules/finicoin";
import { grabGif } from "../utilities/gif";
import { randomNumber } from "../utilities/randomNumber";

/** A win pays the bet back once over. */
const PRIZE_MULTIPLIER = 1;

/** Shown when the GIF search finds nothing. */
const WINNING_GIFS = [
  "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExMmIxeW14YWE2eWU0NjFnN3p0cmVzZ2tmenN6ZGU5cmhwYmI1NHo5NiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/fT3PPZwB2lZMk/giphy.gif",
  "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWJyamRhdHRqcDFlbGdsOHplNzNza2Q3dDh4ZzZkYm55cHAycmlucyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ErZ8hv5eO92JW/giphy.gif",
  "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExcTIwNWkzbnU4eGFjaTQ2ZjE2MHNmMGc1YmZzaGkya3cwcjE5ZnIxNiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/JXibbAa7ysN9K/giphy.gif",
  "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExOTgyYmg2Zm5iMHBlcHRiaTU5Z2w3em1xcXNzdmp0MDJoeG1paDl4eiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/vkb4aEjq5TqqQ/giphy.gif",
  "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExcHRvZWh0aHZlZWI5ZDM0Z2ozaWI4N2U5ZTBzd2ZhY3p4dWZudG83NiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/wkW0maGDN1eSc/giphy.gif",
  "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExaHR2ZG5kd3VrdDhkN3gyOXBwNzV4ZWM5ZDN6amZhbmZ4dnNvN2R0MSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/naiatn5LxTOsU/giphy.gif",
  "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzR6dmdzbTRxNjdrYWswd2x6eDQ1MXVpOXIxZDFlcXdjZjZtbWV4YiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/eSwGh3YK54JKU/giphy.gif",
  "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExN29oczBqbWp0eDcxYmxicHR2cmlqbnMzYmp2MWl2aW9ub2V2YTNqaiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Y01jP8QeLOox2/giphy.gif",
  "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExcXkxampsamhtMG82ano0M3h5OXMyb240MGRqaTQybmYxejAweW40YiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3NnnS6Q8hVPZC/giphy.gif",
  "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExcG12ZDZld2hkam92NjFqNXI3dG9vdHBkeG4yOW9lNXdkbHlnZ2V2NyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/INlJUYclnafdu/giphy.gif",
];
const LOSING_GIFS = [
  "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExNms1Z292NWpydDk3cHV6dXNuanppZGRncXhleWJldmJiNHdjdnhjZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l0Iy33dWjmywkCnNS/giphy.gif",
  "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExd3RhZTFqMW1xeG42aXBkOTVpbnRvZnIxaHFjcXczc2ZvZDgxdHpocCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/4QxQgWZHbeYwM/giphy.gif",
  "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWN5NmlncHd0ZWY5MDB6bzhiY2ZqOWExdzVtZ2Q4M2x5aDJ5c2VubCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Y4z9olnoVl5QI/giphy.gif",
  "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2x5dGNkcjA2bzZvdWVqZWp0d3BoeTRwam40ZnNyZHAzdHFzcGZjdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/lugsI4ciwbRa05ix0g/giphy.gif",
  "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3RrZXFnazk4aWpxaW10ZzkwN2R6bDNxNTM4ZW9uZGs5cDFlcjE2ZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/jAe22Ec5iICCk/giphy.gif",
  "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExd3RxZ2JlMHRzbGJ2bWRrb2l5azR1NWRma3VtZjd2aGNzbG9kc2JzZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/u2LJ0n4lx6jF6/giphy.gif",
  "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzJrYjgyNWZocmVsZ2lhZXV6emV0bzV3bG82Z3I1a3czcmFreWRsMCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/FB5EOw0CaaQM0/giphy.gif",
  "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZGwzZ211eTZwam1md2p4eTBrZndybnp0cmk3dXdlajRxeWNyMDN4eCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/bi6RQ5x3tqoSI/giphy.gif",
  "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExZjM1cHRtNGtmNm4xMzF3czUyMjIzYWhwNWNmMmVxYmdzNjg0eGdxdiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/eHekyNso61EqY/giphy.gif",
  "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExb2U0NGxnejEzY2JwOXZka3BraXhsdTU5aHl1aDB1bjF6Y3N1cGFvbSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/gZBYbXHtVcYKs/giphy.gif",
];

export const data = new SlashCommandBuilder()
  .setName("evenodd")
  .setDescription(
    "A simple game, you wager Finicoin and guess if the result is even, or odd",
  )
  .addNumberOption((opt) =>
    opt
      .setName("bet")
      .setDescription("How much are you betting?")
      .setRequired(true)
      .setMinValue(1),
  )
  .addStringOption((opt) =>
    opt
      .setName("option")
      .setDescription("Is it Even or Odd?")
      .setRequired(true)
      .addChoices([
        {
          name: "Even",
          value: "Even",
        },
        {
          name: "Odd",
          value: "Odd",
        },
      ]),
  );

const pickOne = (gifs: string[]) =>
  gifs[randomNumber(0, gifs.length - 1, true)];

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const bet = Math.abs(interaction.options.getNumber("bet") ?? 0);
  const option = interaction.options.getString("option") || "Even";

  if (bet < 0.1) {
    await interaction.reply("You cannot bet less than 0.10 finicoin");
    return;
  }

  const { rewardWager, userBalance, userHasFunds } = await runGame(
    interaction.user.id,
    interaction.guildId || "unknown guild id",
    bet,
    interaction.user.username,
    interaction.guild?.name ?? "unknown guild name",
  );

  if (!userHasFunds) {
    await interaction.reply(
      `You do not have enough Finicoin to complete this transaction\n**Current Balance:** ${userBalance.toLocaleString()}\n**Your Wager:** ${bet.toLocaleString()}`,
    );
    return;
  }

  // The GIF search can take longer than Discord waits for a first answer.
  await interaction.deferReply();

  const outcome = randomNumber(0, 9, true) % 2 === 0 ? "Even" : "Odd";
  const userHasWon = outcome === option;
  let settled = false;

  try {
    // Settle the bet before anything that only decorates the result.
    await rewardWager(userHasWon, PRIZE_MULTIPLIER);
    settled = true;

    const gif =
      (await grabGif(`waifu ${userHasWon ? "winner" : "failure"}`, "giphy")) ||
      pickOne(userHasWon ? WINNING_GIFS : LOSING_GIFS);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder({
          color: 0xffea00,
          title: "Even / Odd",
          description: userHasWon
            ? `${outcome} === ${outcome}`
            : `${outcome} != ${option}`,
          image: { url: gif },
          fields: [
            { name: "Your Bet", value: bet.toLocaleString(), inline: true },
            {
              name: "Your Winnings",
              value: userHasWon ? bet.toLocaleString() : "0",
              inline: true,
            },
          ],
          footer: {
            text: `New Balance: ${(userHasWon
              ? userBalance + bet
              : userBalance - bet
            ).toLocaleString()}`,
          },
        }),
      ],
    });
  } catch (err) {
    console.error("Error running /evenodd:", err);
    await interaction
      .editReply(
        settled
          ? `Something went wrong showing the result, but your bet is settled: it was ${outcome}, so you ${userHasWon ? `won ${bet.toLocaleString()}` : `lost ${bet.toLocaleString()}`} finicoin.`
          : "Something went wrong before your bet was settled, so no finicoin changed hands.",
      )
      .catch(() => undefined);
  } finally {
    logCommand();
  }
};
