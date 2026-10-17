import { ButtonInteraction, Collection, MessageFlags } from "discord.js";
import { getButtonFiles } from "../utilities/interactionFiles/getInteractionFiles";
import type { ButtonHandler } from "../types/handlers";
import { replyWithError } from "../utilities/discord/replyWithError";

// Store button handlers in a collection
export const buttonHandlers = new Collection<string, ButtonHandler>();

// Load all button handlers at startup
export async function loadButtonHandlers() {
  const { handlers } = await getButtonFiles();
  for (const handler of handlers) {
    buttonHandlers.set(handler.namespace, handler);
  }

  console.log(`Loaded ${buttonHandlers.size} button handlers`);
}

/**
 * Buttons answered by a collector on their own message rather than by a
 * handler file: the flow that posted them is listening for them. They are
 * left alone here - replying "unknown" would use up the press before the
 * collector could answer it.
 */
const COLLECTOR_BUTTONS = [
  /^v2pack-/,
  /^v2sell-/,
  /^v2trade-/,
  /^cancel-trade$/,
  /^purchase$/,
];

export const isCollectorButton = (customId: string): boolean =>
  COLLECTOR_BUTTONS.some((pattern) => pattern.test(customId));

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  if (isCollectorButton(interaction.customId)) return;

  // Parse customId: "namespace:data:userId"
  const [namespace, ...args] = interaction.customId.split(":");

  // Get handler from collection
  const handler = buttonHandlers.get(namespace);

  if (!handler) {
    console.warn(`Unknown button namespace: ${namespace}`);
    await interaction.reply({
      content: "❌ Unknown button action",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  try {
    await handler.execute(interaction, args);
  } catch (error) {
    console.error(`Error executing button handler ${namespace}:`, error);

    await replyWithError(
      interaction,
      "❌ An error occurred while processing this button",
    );
  }
}
