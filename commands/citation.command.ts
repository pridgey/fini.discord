import { SlashCommandBuilder } from "@discordjs/builders";
import { AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import { Citation } from "@blockzilla101/citation";

export const data = new SlashCommandBuilder()
  .setName("citation")
  .setDescription("Generates a Papers Please style citation")
  .addStringOption((option) =>
    option
      .setName("title")
      .setDescription("the title at the top")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("citation")
      .setDescription("the actual issue")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("penalty")
      .setDescription("the penalty at the bottom")
      .setRequired(true),
  )
  .addBooleanOption((option) =>
    option.setName("gif").setDescription("render as a gif").setRequired(false),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const title = interaction.options.get("title")?.value?.toString() || "";
  const citation = interaction.options.get("citation")?.value?.toString() || "";
  const penalty = interaction.options.get("penalty")?.value?.toString() || "";
  const isGif: boolean = Boolean(interaction.options.get("gif")?.value ?? true);

  // Function to generate the citation image
  const generateCitation = async (
    title: string,
    penalty: string,
    reason: string,
    gif: boolean,
  ) => {
    console.log("generateCitation", { title, penalty, reason, gif });
    const citation = new Citation();

    citation.reason = reason;
    citation.penalty = penalty;
    citation.title = title;

    const buffer = await citation.render("citation.gif", gif);

    const attachment = new AttachmentBuilder(buffer, { name: "citation.gif" });

    return attachment;
  };

  try {
    if (!title || !citation || !penalty) {
      console.log("Bad path", { title, citation, penalty });
      await interaction.deferReply();

      const attachment = await generateCitation(
        "You dun goofed",
        "To the gulag with you.",
        "You cannot create a citation without citation.",
        true,
      );

      await interaction.editReply({
        files: [attachment],
      });
      logCommand();
    } else {
      // Check length
      if (title.length > 200 || penalty.length > 200 || citation.length > 1000) {
        await interaction.deferReply();

        const attachment = await generateCitation(
          "Length Too Long",
          "/slap Graham",
          "One of your parameters has too many characters.",
          isGif,
        );

        await interaction.editReply({
          files: [attachment],
        });
        logCommand();
      } else {
        // All good
        await interaction.deferReply();

        const attachment = await generateCitation(
          title,
          penalty,
          citation,
          isGif,
        );

        await interaction.editReply({
          files: [attachment],
        });
        logCommand();
      }
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /citation command", { error });
  }
};
