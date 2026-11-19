import { Collection, StringSelectMenuInteraction } from "discord.js";
import { getSelectFiles } from "../utilities/interactionFiles/getInteractionFiles";
import type { SelectHandler } from "../types/handlers";
import { replyWithError } from "../utilities/discord/replyWithError";

/**
 * Dropdowns, routed like buttons: the custom id's first part (split on ":")
 * names the handler, and the rest arrives as `args`.
 */
export const selectHandlers = new Collection<string, SelectHandler>();

export async function loadSelectHandlers() {
  const { handlers } = await getSelectFiles();
  for (const handler of handlers) {
    selectHandlers.set(handler.namespace, handler);
  }

  console.log(`Loaded ${selectHandlers.size} dropdown handlers`);
}

export async function handleSelectInteraction(
  interaction: StringSelectMenuInteraction,
) {
  const [namespace, ...args] = interaction.customId.split(":");
  const handler = selectHandlers.get(namespace);

  // Left unanswered rather than refused: a flow listening on its own message
  // with a collector answers its dropdowns itself, and a reply here would use
  // up the pick before it could.
  if (!handler) return;

  try {
    await handler.execute(interaction, args);
  } catch (error) {
    console.error(`Error executing dropdown handler ${namespace}:`, error);
    await replyWithError(
      interaction,
      "❌ An error occurred while processing that choice",
    );
  }
}
