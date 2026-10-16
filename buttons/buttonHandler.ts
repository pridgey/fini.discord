import { ButtonInteraction, Collection } from "discord.js";
import { getButtonFiles } from "../utilities/interactionFiles/getInteractionFiles";

// Store button handlers in a collection
export const buttonHandlers = new Collection<string, any>();

// Load all button handlers at startup
export async function loadButtonHandlers() {
  const { importedFiles } = await getButtonFiles();

  for (const file of importedFiles) {
    if ("namespace" in file && "execute" in file) {
      buttonHandlers.set(file.namespace, file);
      console.log(`✅ Loaded button handler: ${file.namespace}`);
    } else {
      console.warn("⚠️ Button file missing namespace or execute export");
    }
  }

  console.log(`Loaded ${buttonHandlers.size} button handlers`);
}

/**
 * Buttons answered by a collector on their own message rather than by a
 * handler file: the flow that posted them is listening for them. They are
 * left alone here - replying "unknown" would use up the press before the
 * collector could answer it.
 */
const COLLECTOR_BUTTONS = [/^v2pack-/, /^v2sell-/, /^v2trade-/, /^cancel-trade$/, /^purchase$/];

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
      ephemeral: true,
    });
    return;
  }

  try {
    await handler.execute(interaction, args);
  } catch (error) {
    console.error(`Error executing button handler ${namespace}:`, error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while processing this button",
        ephemeral: true,
      });
    }
  }
}
