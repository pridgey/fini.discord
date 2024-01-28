import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, EmbedBuilder } from "discord.js";
import seedrandom from "seedrandom";
import { runGame } from "../modules";
import { grabGif } from "../utilities";
import { randomNumber } from "../utilities/randomNumber";

// Game config
const PrizeMultiplier = 2;
const winningGifs = [
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
const losingGifs = [
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
    "A simple game, you wager Finicoin and guess if the result is even, or odd"
  )
  .addNumberOption((opt) =>
    opt
      .setName("bet")
      .setDescription("How much are you betting?")
      .setRequired(true)
      .setMinValue(1)
  )
  .addStringOption((opt) =>
    opt
      .setName("option")
      .setDescription("Is it Even or Odd?")
      .setRequired(true)
      .addChoice("Even", "Even")
      .addChoice("Odd", "Odd")
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const bet = Math.abs(
    parseFloat(interaction?.options?.get("bet")?.value?.toString() || "") || 0
  );
  const option = interaction.options.get("option")?.value?.toString() || "Even";

  // Call runGame() to run pre-game checks
  const { rewardWager, userBalance, userHasFunds, onError } = await runGame(
    interaction.user.id,
    interaction.guildId || "",
    bet
  );

  if (!userHasFunds) {
    // User doesn't have the funds, let them know
    interaction.reply(
      `You do not have enough Finicoin to complete this transaction\n**Current Balance:** ${userBalance.toLocaleString()}\n**Your Wager:** ${bet.toLocaleString()}`
    );
  } else {
    try {
      // The user has the appropriate funds. Play the game
      const randomNum = randomNumber(interaction.token, 0, 9);
      const outcome = randomNum % 2 === 0 ? "Even" : "Odd";
      const userHasWon = outcome === option;
      let gif = await grabGif(
        `waifu ${userHasWon ? "winner" : "failure"}`,
        "giphy"
      );

      // If the gif call fails, use a fallback gif url
      if (!gif) {
        const randomIndex = randomNumber(interaction.token, 0, 9);
        gif = userHasWon ? winningGifs[randomIndex] : losingGifs[randomIndex];
      }

      // Run postgame
      await rewardWager(userHasWon, PrizeMultiplier);

      // Build Result Embed
      const resultEmbed = new EmbedBuilder({
        color: 0xffea00,
        title: "Even / Odd",
        description: userHasWon
          ? `${outcome} === ${outcome}`
          : `${outcome} != ${option}`,
        image: {
          url: gif,
        },
        fields: [
          {
            name: "Your Bet",
            value: bet.toLocaleString(),
            inline: true,
          },
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
      });

      // Reply
      interaction.reply({
        embeds: [resultEmbed],
      });
    } catch (err) {
      // An issue with the game
      onError();
      interaction.reply(
        "An error occurred during running the game. Your finicoin has been refunded."
      );
    } finally {
      logCommand();
    }
  }
};
