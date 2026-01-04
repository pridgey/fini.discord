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

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  // Parse customId: "namespace:data:userId"
  const [namespace, ...args] = interaction.customId.split(":");

  // Security: Check if button is for this user
  const userId = args[args.length - 1];
  if (userId && userId !== interaction.user.id) {
    await interaction.reply({
      content: "❌ This button is not for you!",
      ephemeral: true,
    });
    return;
  }

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
