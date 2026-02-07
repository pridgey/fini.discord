import { SlashCommandBuilder } from "@discordjs/builders";
import { AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import { calculatePokemonTypeEffectiveness } from "../utilities/pokemonTypes/typeEffective";
import { toCapitalize } from "../utilities/strings/toCapitalize";

export const data = new SlashCommandBuilder()
  .setName("pokemon")
  .setDescription("Looks up Pokemon information")
  .addStringOption((option) =>
    option
      .setName("tag")
      .setDescription("Look up a Pokemon, Ability, Item or Move")
      .setRequired(true),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const pokemonTag =
    interaction.options
      .get("tag")
      ?.value?.toString()
      .trimStart()
      .trimEnd()
      .replaceAll(" ", "-") || "";

  await interaction.deferReply();

  try {
    const pokemonResponse = await fetch(
      `https://pokeapi.co/api/v2/pokemon/${pokemonTag.toLowerCase().trim()}`,
    );

    if (pokemonResponse.ok) {
      const data = await pokemonResponse.json();

      // Build pokemon response
      const imageAttachment = new AttachmentBuilder(
        data.sprites.other.home.front_default || "",
        {
          name: `${pokemonTag}.jpg`,
        },
      );

      const pokemonTypeEffectiveness = calculatePokemonTypeEffectiveness(
        data.types.map((t) => t.type.name),
      );

      const WeakToString = `\r\n*Weak To:* ${pokemonTypeEffectiveness.WeakTo.map(
        (t) => `${t.type} (${t.effective}x)`,
      ).join(", ")}`;

      const ImmuneToString = `\r\n*Immune To:* ${pokemonTypeEffectiveness.ImmuneTo.map(
        (t) => `${t.type} (${t.effective}x)`,
      ).join(", ")}`;

      const NeutralToString = `\r\n*Neutral To:* ${pokemonTypeEffectiveness.NeutralTo.map(
        (t) => `${t.type} (${t.effective}x)`,
      ).join(", ")}`;

      const ResistantToString = `\r\n*Resistant To:* ${pokemonTypeEffectiveness.ResistantTo.map(
        (t) => `${t.type} (${t.effective}x)`,
      ).join(", ")}`;

      await interaction.editReply({
        content: `**${toCapitalize(
          pokemonTag,
        )}** (Pokemon)${NeutralToString}${WeakToString}${ImmuneToString}${ResistantToString}`,
        files: [imageAttachment],
      });
    } else {
      // Try /ability
      const abilityResponse = await fetch(
        `https://pokeapi.co/api/v2/ability/${pokemonTag.toLowerCase().trim()}`,
      );

      if (abilityResponse.ok) {
        const abilityData = await abilityResponse.json();

        const display = toCapitalize(abilityData.name);

        await interaction.editReply(
          `**${display}** (Ability)\r\n${abilityData.effect_entries
            .filter((ee) => ee.language.name === "en")
            .map((ee) => ee.effect)
            .join(", ")}`,
        );
      } else {
        // Try /move
        const moveResponse = await fetch(
          `https://pokeapi.co/api/v2/move/${pokemonTag.toLowerCase().trim()}`,
        );

        if (moveResponse.ok) {
          const moveData = await moveResponse.json();

          interaction.editReply(
            `**${toCapitalize(moveData.name)}** (Move)\r\nType: ${toCapitalize(
              moveData.type.name,
            )}\r\n${moveData.effect_entries
              .filter((ee) => ee.language.name === "en")
              .map((ee) => ee.effect)
              .join(", ")}`,
          );
        } else {
          // Try /item
          const itemResponse = await fetch(
            `https://pokeapi.co/api/v2/item/${pokemonTag.toLowerCase().trim()}`,
          );

          if (itemResponse.ok) {
            const itemData = await itemResponse.json();

            interaction.editReply(
              `**${toCapitalize(
                itemData.name,
              )}** (Item)\r\n${itemData.effect_entries
                .filter((ee) => ee.language.name === "en")
                .map((ee) => ee.effect)
                .join(", ")}`,
            );
          } else {
            // Default to failure
            await interaction.editReply("I couldn't find that...");
          }
        }
      }
    }
  } catch (err) {
    await interaction.editReply(
      `Error during /pokemon: ${(err as unknown as Error).message}`,
    );
  } finally {
    logCommand();
  }
};
