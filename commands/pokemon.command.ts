import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ChatInputCommandInteraction,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { englishEffect, findOnPokeApi } from "../modules/pokemon/pokeApi";
import { calculatePokemonTypeEffectiveness } from "../modules/pokemon/typeEffective";
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
  const pokemonTag = interaction.options.getString("tag") || "";

  await interaction.deferReply();

  try {
    const found = await findOnPokeApi(pokemonTag);

    if (!found) {
      await interaction.editReply("I couldn't find that...");
      return;
    }

    if (found.kind !== "pokemon") {
      const { data } = found;
      const label = { ability: "Ability", move: "Move", item: "Item" }[
        found.kind
      ];
      const moveType = data.type
        ? `Type: ${toCapitalize(data.type.name)}\r\n`
        : "";
      await interaction.editReply(
        `**${toCapitalize(data.name)}** (${label})\r\n${moveType}${englishEffect(data)}`,
      );
      return;
    }

    const { data } = found;

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
  } catch (err) {
    await interaction.editReply(
      `Error during /pokemon: ${(err as unknown as Error).message}`,
    );
  } finally {
    logCommand();
  }
};
