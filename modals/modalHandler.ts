import { Collection, ModalSubmitInteraction } from "discord.js";
import { getModalFiles } from "../utilities/interactionFiles/getInteractionFiles";

// Store modal handlers in a collection
export const modalHandlers = new Collection<string, any>();

// Load all modal handlers at startup
export async function loadModalHandlers() {
  const { importedFiles } = await getModalFiles();

  for (const file of importedFiles) {
    if ("namespace" in file && "execute" in file) {
      modalHandlers.set(file.namespace, file);
      console.log(`✅ Loaded modal handler: ${file.namespace}`);
    } else {
      console.warn("⚠️ Modal file missing namespace or execute export");
    }
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
      ephemeral: true,
    });
    return;
  }

  try {
    await handler.execute(interaction, args);
  } catch (error) {
    console.error(`Error executing modal handler ${namespace}:`, error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while processing this modal",
        ephemeral: true,
      });
    }
  }
}
