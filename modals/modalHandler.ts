import { Collection, ModalSubmitInteraction, MessageFlags } from "discord.js";
import { getModalFiles } from "../utilities/interactionFiles/getInteractionFiles";
import type { ModalHandler } from "../types/handlers";
import { replyWithError } from "../utilities/discord/replyWithError";

// Store modal handlers in a collection
export const modalHandlers = new Collection<string, ModalHandler>();

// Load all modal handlers at startup
export async function loadModalHandlers() {
  const { handlers } = await getModalFiles();
  for (const handler of handlers) {
    modalHandlers.set(handler.namespace, handler);
  }

  console.log(`Loaded ${modalHandlers.size} modal handlers`);
}

export async function handleModalInteraction(
  interaction: ModalSubmitInteraction,
) {
  // Parse customId: "namespace:data:userId"
  const [namespace, ...args] = interaction.customId.split(":");

  // Get handler from collection
  const handler = modalHandlers.get(namespace);

  if (!handler) {
    console.warn(`Unknown modal namespace: ${namespace}`);
    await interaction.reply({
      content: "❌ Unknown modal action",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  try {
    await handler.execute(interaction, args);
  } catch (error) {
    console.error(`Error executing modal handler ${namespace}:`, error);

    await replyWithError(
      interaction,
      "❌ An error occurred while processing this modal",
    );
  }
}
