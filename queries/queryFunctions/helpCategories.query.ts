import { ContainerBuilder } from "discord.js";
import {
  getHelpCategories,
  type HelpCategory,
} from "../../modules/help/commandIndex";
import {
  QueryFunction,
  QueryParams,
  ResultsBuilder,
} from "../../types/QueryTypes";

/**
 * `/help`, as a page of the shared pagination system - one category per page.
 *
 * A `QueryFunction` is just an interface; nothing about it requires a database.
 * Implementing help as one means the prev/next buttons, the page indicator and
 * the context expiry all come for free, instead of a second bespoke pager.
 *
 * Paging by category rather than by a fixed command count is what keeps each
 * page a coherent thing to read, and it sidesteps Discord's 4000-character
 * budget for a Components V2 message - all 44 commands with descriptions do not
 * comfortably fit on one.
 */

/**
 * Pages are categories, so `perPage` is ignored and fixed at one.
 *
 * The caller sets `perPage: 1` to match; honouring an arbitrary value would
 * mean rendering several categories into one container and losing that.
 */
const queryHelpCategories = async ({ page }: QueryParams) => {
  const categories = await getHelpCategories();

  const totalPages = Math.max(1, categories.length);
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  return {
    items: categories.slice(currentPage - 1, currentPage),
    totalItems: categories.length,
    totalPages,
    currentPage,
    perPage: 1,
  };
};

/** How many subcommands to name inline before pointing at `/help command:`. */
const MAX_SUBCOMMANDS_SHOWN = 8;

const buildHelpCategoryResult = async ({
  items,
}: ResultsBuilder<HelpCategory>) => {
  const category = items.at(0);

  const container = new ContainerBuilder().setAccentColor(0x5865f2);

  if (!category) {
    container.addTextDisplayComponents((text) =>
      text.setContent("## 📖 Fini Help\nNo commands found."),
    );
    return { components: [container], useComponentsV2: true };
  }

  container.addTextDisplayComponents((text) =>
    text.setContent(
      `## 📖 ${category.name}\n-# ${category.commands.length} command${
        category.commands.length === 1 ? "" : "s"
      }`,
    ),
  );

  for (const command of category.commands) {
    const lines = [`**/${command.name}** — ${command.description}`];

    if (command.subcommands.length > 0) {
      const shown = command.subcommands
        .slice(0, MAX_SUBCOMMANDS_SHOWN)
        .map((sub) => `\`${sub.name}\``);

      const remaining = command.subcommands.length - shown.length;

      lines.push(
        `-# ${shown.join(" ")}${remaining > 0 ? ` +${remaining} more` : ""}`,
      );
    }

    container.addTextDisplayComponents((text) =>
      text.setContent(lines.join("\n")),
    );
  }

  container
    .addSeparatorComponents((separator) => separator)
    .addTextDisplayComponents((text) =>
      text.setContent(
        "-# Use `/help command:<name>` for full details on any command.",
      ),
    );

  return {
    components: [container],
    useComponentsV2: true,
  };
};

export const helpCategoriesQuery: QueryFunction<HelpCategory> = {
  query: queryHelpCategories,
  id: "help_commands",
  buildResults: buildHelpCategoryResult,
};
