import type { SlashCommand } from "../types/handlers";
import { SlashCommandBuilder } from "@discordjs/builders";
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import {
  findCommand,
  getCommandIndex,
  type HelpCommand,
} from "../modules/help/commandIndex";
import { QueryHandler } from "../queries/QueryHandler";
import {
  createPaginationContext,
  createPaginationRow,
} from "../utilities/pagination/pagination";

/**
 * The command index, for humans.
 *
 * Two shapes: no argument pages through categories, and `command:` shows one
 * command in full. Everything it prints comes from the command files
 * themselves (`modules/help/commandIndex.ts`), so it cannot describe a command
 * that doesn't exist or miss one that does.
 */

/** Discord rejects an autocomplete response with more than 25 choices. */
const MAX_AUTOCOMPLETE_CHOICES = 25;

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Everything Fini can do")
  .addStringOption((option) =>
    option
      .setName("command")
      .setDescription("Show full details for one command")
      .setRequired(false)
      // Not addChoices: there are 44 commands and Discord caps choices at 25.
      .setAutocomplete(true),
  );

/** Renders `name:` / `name (optional):` the way the detail view lists options. */
const optionLine = (option: {
  name: string;
  description: string;
  required: boolean;
}): string =>
  `-# \`${option.name}\`${option.required ? "" : " _(optional)_"} — ${option.description}`;

/** The full page for one command: description, subcommands, options. */
const buildCommandDetail = (command: HelpCommand): ContainerBuilder => {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents((text) =>
      text.setContent(
        `## /${command.name}\n${command.description}\n-# ${command.category}`,
      ),
    );

  if (command.subcommands.length > 0) {
    container.addSeparatorComponents((separator) => separator);

    for (const sub of command.subcommands) {
      const lines = [`**/${command.name} ${sub.name}** — ${sub.description}`];

      for (const option of sub.options) lines.push(optionLine(option));

      container.addTextDisplayComponents((text) =>
        text.setContent(lines.join("\n")),
      );
    }
  } else if (command.options.length > 0) {
    container
      .addSeparatorComponents((separator) => separator)
      .addTextDisplayComponents((text) =>
        text.setContent(
          ["**Options**", ...command.options.map(optionLine)].join("\n"),
        ),
      );
  }

  return container;
};

export const execute: SlashCommand["execute"] = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  try {
    await interaction.deferReply();

    const wanted = interaction.options.getString("command");

    /* ------------------------------------------- one command in detail ---- */
    if (wanted) {
      const command = await findCommand(wanted);

      if (!command) {
        await interaction.editReply(
          `There's no \`/${wanted.replace(/^\//, "")}\` command. Run \`/help\` to browse everything Fini can do.`,
        );
        return;
      }

      await interaction.editReply({
        components: [buildCommandDetail(command)],
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    /* ------------------------------------------ browse by category ---- */
    const query = QueryHandler("help_commands");
    const results = await query.query({ page: 1, perPage: 1 });

    /*
     * `wrap` makes the browser loop at both ends, which is the right feel for
     * a short ring of categories - you should never hit a dead Next button
     * while skimming. It needs `totalPagesOverride` because wrapping backwards
     * from page 1 has to know where the end is before running the query.
     */
    const contextId = await createPaginationContext({
      userId: interaction.user.id,
      queryId: query.id,
      perPage: 1,
      totalPagesOverride: results.totalPages,
      wrap: true,
    });

    const { components } = await query.buildResults({
      items: results.items,
      userId: interaction.user.id,
      contextId,
    });

    const pageRow = createPaginationRow({
      userId: interaction.user.id,
      currentPage: results.currentPage,
      totalPages: results.totalPages,
      contextId,
      wrap: true,
    });

    await interaction.editReply({
      components: [...(components ?? []), pageRow],
      flags: [MessageFlags.IsComponentsV2],
    });
  } catch (err) {
    console.error("Error running /help command", err);

    if (interaction.deferred || interaction.replied) {
      await interaction
        .editReply("Error building help.")
        .catch(() => undefined);
    } else {
      await interaction.reply("Error building help.").catch(() => undefined);
    }
  } finally {
    logCommand();
  }
};

/**
 * Suggests command names, matched on the name or its description.
 *
 * Matching the description too means typing "card" surfaces `/finicard`,
 * which is the case where someone needs help most - they know what they want,
 * not what it's called.
 */
export const autocomplete = async (interaction: AutocompleteInteraction) => {
  try {
    const typed =
      interaction.options.getFocused()?.toString().toLowerCase() ?? "";
    const commands = await getCommandIndex();

    const matched = commands.filter(
      (command) =>
        command.name.includes(typed) ||
        command.description.toLowerCase().includes(typed),
    );

    await interaction.respond(
      matched.slice(0, MAX_AUTOCOMPLETE_CHOICES).map((command) => ({
        // The description is the useful half, but the name has to survive
        // truncation - Discord caps a choice name at 100 characters.
        name: `/${command.name} — ${command.description}`.slice(0, 100),
        value: command.name,
      })),
    );
  } catch (err) {
    console.error("Error running /help autocomplete", err);
    await interaction.respond([]).catch(() => undefined);
  }
};
