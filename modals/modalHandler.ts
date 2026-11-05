import { Collection, ModalSubmitInteraction, MessageFlags } from "discord.js";
import { getModalFiles } from "../utilities/interactionFiles/getInteractionFiles";
import type { ModalHandler } from "../types/handlers";
import { replyWithError } from "../utilities/discord/replyWithError";
import { createLog } from "../modules/logger";

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
  } finally {
    await logModal(interaction, namespace);
  }
}

/** What was typed or picked in each of a form's fields. */
const describeFields = (interaction: ModalSubmitInteraction) =>
  [...(interaction.fields?.fields?.values() ?? [])].map((field) => {
    const value =
      "value" in field
        ? field.value
        : "values" in field
          ? field.values?.join(", ")
          : undefined;
    return `${field.customId}: ${value}`;
  });

/**
 * Forms carry real actions, like buying stock, so each submission is logged
 * like a slash command: the form's id, its fields, and the reply.
 */
const logModal = async (
  interaction: ModalSubmitInteraction,
  namespace: string,
) => {
  try {
    const output = await interaction
      .fetchReply()
      .then((reply) => reply.content)
      .catch(() => "<no reply - interaction expired>");

    await createLog({
      command: `modal:${namespace}`,
      input: [
        `customId: ${interaction.customId}`,
        ...describeFields(interaction),
      ].join(",\n"),
      output,
      server_id: interaction.guildId ?? "unknown",
      channel_id: interaction.channelId ?? "unknown",
      user_id: interaction.user?.id ?? "unknown",
    });
  } catch (logErr) {
    console.error("Error logging modal:", logErr);
  }
};
