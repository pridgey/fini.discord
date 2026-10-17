import type { ButtonHandler } from "../../types/handlers";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { MAX_VOICE_NAME_LENGTH, readPendingVoice } from "../../modules/tts";

/**
 * "Save voice" under a `/tts say` reply that used an uploaded clip.
 *
 * Anyone can press it, not only whoever uploaded the clip - saved voices are
 * shared, and the person who wants to keep a voice is often not the one who
 * found it. Whoever saves it owns it, and is the one who can delete it.
 */

export const namespace = "tts_save_voice";

/**
 * The button, for a stashed clip.
 * @param pendingId The id from `stashPendingVoice`
 * @returns A row holding the save button
 */
export const saveVoiceRow = (pendingId: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${namespace}:${pendingId}`)
      .setLabel("Save voice")
      .setEmoji("💾")
      .setStyle(ButtonStyle.Secondary),
  );

/**
 * What the button turns into once the clip is saved, so nobody tries again.
 * @param name The name it was saved under
 * @returns A row holding a disabled button
 */
export const savedVoiceRow = (name: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${namespace}:saved`)
      .setLabel(`Saved as ${name}`.slice(0, 80))
      .setEmoji("✅")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );

export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [pendingId] = args;

  if (!(await readPendingVoice(pendingId))) {
    await interaction.reply({
      content:
        "I only hold onto clips for a day, and that one's gone. Save it with `/tts save` and the clip instead.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const nameInput = new TextInputBuilder()
    .setCustomId("name")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. Big Bob")
    .setRequired(true)
    .setMaxLength(MAX_VOICE_NAME_LENGTH);

  const modal = new ModalBuilder()
    .setCustomId(`tts_save_voice_modal:${pendingId}`)
    .setTitle("Save this voice")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("What should it be called?")
        .setTextInputComponent(nameInput),
    );

  await interaction.showModal(modal);
};
