import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, EmbedBuilder } from "discord.js";
import seedrandom from "seedrandom";
import { runGame } from "../modules";
import { grabGif } from "../utilities";

// Game config
const PrizeMultiplier = 2;

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
  const { rewardWager, userBalance, userHasFunds } = await runGame(
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
    // The user has the appropriate funds. Play the game
    const rng = seedrandom(interaction.token);
    const randomNumber = Math.round(rng() * 9);
    const outcome = randomNumber % 2 === 0 ? "Even" : "Odd";
    const userHasWon = outcome === option;
    const gif = await grabGif(
      `anime ${userHasWon ? "winner" : "failure"}`,
      "tenor"
    );

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

    logCommand();
  }
};
