import type { ModalHandler } from "../../types/handlers";
import { MessageFlags, ModalSubmitInteraction } from "discord.js";
import {
  discardPendingVoice,
  readPendingVoice,
  saveVoice,
} from "../../modules/tts";
import { savedVoiceRow } from "../../buttons/individualButtons/ttsSaveVoice.button";

/**
 * The name for a clip being saved from a `/tts say` reply.
 *
 * Duplicates are checked again here rather than trusted from when the button
 * was offered: the same clip can be uploaded twice in a day, and only the
 * first save should win.
 */

export const namespace = "tts_save_voice_modal";

export const execute: ModalHandler["execute"] = async (
  interaction: ModalSubmitInteraction,
  args: string[],
) => {
  const [pendingId] = args;
  const pending = await readPendingVoice(pendingId);

  if (!pending) {
    await interaction.reply({
      content:
        "I only hold onto clips for a day, and that one's gone. Save it with `/tts save` and the clip instead.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const result = await saveVoice({
    name: interaction.fields.getTextInputValue("name"),
    clipPath: pending.clipPath,
    clipHash: pending.clipHash,
    transcript: pending.transcript,
    userId: interaction.user.id,
    serverId: interaction.guildId ?? "unknown",
  });

  // A name that is taken or malformed leaves the button where it is, so they
  // can try another. A duplicate does not - that clip is never going to save.
  if (!result.ok && !result.duplicate) {
    await interaction.reply({
      content: result.message,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await discardPendingVoice(pendingId);

  const savedAs = result.ok ? result.voice : result.duplicate!;

  if (interaction.isFromMessage()) {
    await interaction.update({ components: [savedVoiceRow(savedAs.label)] });
  } else {
    await interaction.deferUpdate();
  }

  await interaction.followUp(
    result.ok
      ? {
          content: `🎙️ <@${interaction.user.id}> saved this voice as **${savedAs.label}**. Anyone can use it with \`/tts say voice: ${savedAs.name}\`.`,
          allowedMentions: { parse: [] },
        }
      : { content: result.message, flags: [MessageFlags.Ephemeral] },
  );
};
