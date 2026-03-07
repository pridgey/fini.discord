import { SlashCommandBuilder } from "@discordjs/builders";
import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
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

      const pokemonTypeEffectiveness = calculatePokemonTypeEffectiveness(
        data.types.map((t) => t.type.name),
      );

      const WeakToString = `\r\n**Weak To:** ${pokemonTypeEffectiveness.WeakTo.map(
        (t) => `${t.type} (${t.effective}x)`,
      ).join(", ")}`;

      const ImmuneToString = `\r\n**Immune To:** ${pokemonTypeEffectiveness.ImmuneTo.map(
        (t) => `${t.type} (${t.effective}x)`,
      ).join(", ")}`;

      const NeutralToString = `\r\n**Neutral To:** ${pokemonTypeEffectiveness.NeutralTo.map(
        (t) => `${t.type} (${t.effective}x)`,
      ).join(", ")}`;

      const ResistantToString = `\r\n**Resistant To:** ${pokemonTypeEffectiveness.ResistantTo.map(
        (t) => `${t.type} (${t.effective}x)`,
      ).join(", ")}`;

      // Build pokemon response
      const cardDetail = new ContainerBuilder()
        .setAccentColor(0x9090ff)
        .addTextDisplayComponents((text) =>
          text.setContent(`## ${toCapitalize(data.name)}`),
        )
        .addTextDisplayComponents((text) =>
          text.setContent(
            `**Type:** ${data.types
              .map((t) => toCapitalize(t.type.name))
              .join(" / ")}`,
          ),
        )
        .addTextDisplayComponents((text) =>
          text.setContent(
            `**Abilities:** ${data.abilities
              .map((a) => toCapitalize(a.ability.name))
              .join(" / ")}`,
          ),
        )
        .addMediaGalleryComponents((media) =>
          media.addItems((item) =>
            item
              .setURL(data.sprites.other.home.front_default)
              .setDescription(`${data.name} Image`),
          ),
        )
        .addTextDisplayComponents((text) =>
          text.setContent(
            `**Stats:** ${data.stats
              .map((s) => `${s.stat.name} • ${s.base_stat}`)
              .join(" | ")}`,
          ),
        )
        .addSeparatorComponents((sep) => sep)
        .addTextDisplayComponents((text) => text.setContent(WeakToString))
        .addSeparatorComponents((sep) => sep)
        .addTextDisplayComponents((text) => text.setContent(ImmuneToString))
        .addSeparatorComponents((sep) => sep)
        .addTextDisplayComponents((text) => text.setContent(ResistantToString))
        .addSeparatorComponents((sep) => sep)
        .addTextDisplayComponents((text) => text.setContent(NeutralToString));

      await interaction.editReply({
        components: [cardDetail],
        flags: [MessageFlags.IsComponentsV2],
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
