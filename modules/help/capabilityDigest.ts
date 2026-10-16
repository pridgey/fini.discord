import { getHelpCategories, type HelpCommand } from "./commandIndex";

/**
 * Fini's own command list, rendered for a language model rather than a reader.
 *
 * The bot used to have no idea what it could do: asked "what can you do?" it
 * answered from the model's general notion of a Discord bot and invented
 * commands. This is the ground truth, built from the same index `/help` uses,
 * so the two can never disagree.
 *
 * Compact on purpose. The full digest is around 2.5 KB, which is cheap for
 * Claude in a system prompt but expensive for the local model - see
 * `modules/aiChat/llamaTools.ts`, where it is served as a tool instead so it
 * only costs anything when it's actually asked for.
 */

/**
 * How many subcommands to name before summarising the rest.
 *
 * `/finicard` alone has fourteen. Listing every one crowds out the other
 * forty-odd commands, and naming a few is enough for the model to answer "yes,
 * there's a card game, try `/finicard pack`".
 */
const MAX_SUBCOMMANDS_SHOWN = 6;

const renderCommand = (command: HelpCommand): string => {
  const headline = `/${command.name} - ${command.description}`;

  if (command.subcommands.length === 0) return headline;

  const shown = command.subcommands
    .slice(0, MAX_SUBCOMMANDS_SHOWN)
    .map((sub) => sub.name);

  const remaining = command.subcommands.length - shown.length;
  const more = remaining > 0 ? `, +${remaining} more` : "";

  return `${headline} (subcommands: ${shown.join(", ")}${more})`;
};

/** Whether a command matches a free-text topic from the model. */
const matches = (command: HelpCommand, topic: string): boolean => {
  const haystack = [
    command.name,
    command.description,
    command.category,
    ...command.subcommands.map((sub) => `${sub.name} ${sub.description}`),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(topic);
};

/**
 * Renders the command list as text for a model.
 *
 * @param topic Optional free-text filter. A model asked for "cards" shouldn't
 *   have to read about `/pokemon`; anything that matches nothing falls back to
 *   the full digest rather than returning an empty answer the model would then
 *   report as "Fini has no commands".
 * @returns The digest, grouped by category
 */
export const getCapabilityDigest = async (topic?: string): Promise<string> => {
  const categories = await getHelpCategories();
  const wanted = (topic ?? "").trim().toLowerCase();

  const filtered = wanted
    ? categories
        .map((category) => ({
          ...category,
          commands: category.commands.filter((command) =>
            matches(command, wanted),
          ),
        }))
        .filter((category) => category.commands.length > 0)
    : categories;

  const shown = filtered.length > 0 ? filtered : categories;

  const body = shown
    .map((category) =>
      [
        `${category.name}:`,
        ...category.commands.map((command) => `  ${renderCommand(command)}`),
      ].join("\n"),
    )
    .join("\n\n");

  return [
    "Fini's slash commands, grouped by category. This is the complete and authoritative list - Fini has no other commands.",
    body,
    'Users run these by typing the command in Discord. Fini also replies to any message starting with "hey fini".',
  ].join("\n\n");
};
