import { SlashCommandBuilder } from "@discordjs/builders";
import { AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import { join } from "path";
import {
  ProcessError,
  createJobDeadline,
  createMediaWorkspace,
  downloadToFile,
  findMediaFormat,
  fitTargetBytes,
  formatBytes,
  formatDuration,
  probeMedia,
  safeFileBase,
  tooLargeMessage,
  tryAcquireMediaSlot,
  uploadLimitBytes,
  convertToFit,
} from "../modules/media";
import { expiryTimestamp, tryPublishFile } from "../modules/fileShare";
import {
  DEFAULT_LANGUAGE,
  MAX_SPEECH_SECONDS,
  REFERENCE_SECONDS,
  TTS_LANGUAGES,
  TTS_SETUP_HINT,
  TtsUnavailableError,
  availableVoices,
  findVoice,
  isTtsConfigured,
  prepareSpeakerClip,
  stageVoiceSample,
  synthesizeSpeech,
  voiceChoices,
  voiceList,
} from "../modules/tts";

/**
 * `/tts` - speaks text in a preset voice, or in one cloned from a clip.
 *
 * Runs llama.cpp's `llama-tts` against Qwen3-TTS. The interesting property of
 * that model for this command is that a voice is not a trained model but a few
 * seconds of reference audio - which is what lets the presets ship in the repo
 * as eight small mp3s, and lets anyone add a voice for one message by attaching
 * a clip.
 *
 * The output is transcoded to mp3 rather than posted as the wav `llama-tts`
 * writes. 24kHz mono PCM is 48KB per second, so a minute of speech is a 2.8MB
 * wav against about 300KB of mp3 - and Discord plays an mp3 inline where it
 * makes people download a wav.
 */

/**
 * Longest prompt accepted.
 *
 * Generation is roughly 0.3x realtime on CPU, so this is the knob that decides
 * whether `/tts` answers in fifteen seconds or four minutes. 600 characters is
 * a long paragraph - around 40 seconds of speech, so about two minutes of
 * compute. `MAX_SPEECH_SECONDS` is the backstop underneath it.
 */
const MAX_TEXT_LENGTH = 600;

/**
 * Largest reference clip accepted.
 *
 * Only the first `REFERENCE_SECONDS` are used, so this needs to cover a phone
 * recording of a few seconds rather than a whole song - and every byte of it is
 * downloaded before ffmpeg can trim it.
 */
const MAX_CLIP_BYTES = 25 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 60_000;
const CLIP_PREP_TIMEOUT_MS = 60_000;
const SYNTHESIS_TIMEOUT_MS = 8 * 60 * 1000;
const ENCODE_TIMEOUT_MS = 60_000;

/**
 * Built by mutation rather than by chaining, because the `voice` option is
 * conditional: a string option with an empty choice list is rejected outright
 * by Discord's registration endpoint, so a host without the sample library has
 * to ship the command without the option rather than with an empty one. The
 * required `text` option is added first - Discord rejects a command whose
 * required options come after its optional ones.
 */
const builder = new SlashCommandBuilder()
  .setName("tts")
  .setDescription("Create some audio from text");

builder.addStringOption((option) =>
  option
    .setName("text")
    .setDescription("The text you want me to speak")
    .setRequired(true)
    .setMaxLength(MAX_TEXT_LENGTH),
);

if (availableVoices().length) {
  builder.addStringOption((option) =>
    option
      .setName("voice")
      .setDescription("Whose voice to use")
      .setRequired(false)
      .addChoices(...voiceChoices()),
  );
}

builder.addAttachmentOption((option) =>
  option
    .setName("clip")
    .setDescription(
      `Audio of a voice to imitate instead - the first ${REFERENCE_SECONDS} seconds are used`,
    )
    .setRequired(false),
);

builder.addStringOption((option) =>
  option
    .setName("language")
    .setDescription("What language the text is in (default English)")
    .setRequired(false)
    .addChoices(...TTS_LANGUAGES),
);

export const data = builder;

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const text = interaction.options.get("text")?.value?.toString().trim() ?? "";
  const voiceValue = interaction.options.get("voice")?.value?.toString();
  const clip = interaction.options.get("clip")?.attachment;
  const language =
    interaction.options.get("language")?.value?.toString() ?? DEFAULT_LANGUAGE;

  if (!text) {
    await interaction.reply("You have to give me something to say.");
    logCommand();
    return;
  }

  // Checked before the slot and the defer, so a host that never had the model
  // installed says so immediately instead of after a spinner.
  if (!isTtsConfigured()) {
    await interaction.reply(`Sorry, ${TTS_SETUP_HINT}`);
    logCommand();
    return;
  }

  const voice = findVoice(voiceValue);

  // A stale client can still send a choice the library no longer has, and
  // falling through would silently use the default voice instead of the one
  // that was asked for.
  if (voiceValue && !voice) {
    await interaction.reply(
      `I don't have a voice called "${voiceValue}". I've got: ${voiceList()}.`,
    );
    logCommand();
    return;
  }

  // Both would mean picking one and ignoring the other, and whichever way that
  // went it would look like the command had misheard.
  if (voice && clip) {
    await interaction.reply(
      "Pick one - a preset voice or a clip to imitate, not both.",
    );
    logCommand();
    return;
  }

  if (clip && clip.size > MAX_CLIP_BYTES) {
    await interaction.reply(
      `That clip is ${formatBytes(clip.size)} and I cap at ${formatBytes(
        MAX_CLIP_BYTES,
      )}. I only use the first ${REFERENCE_SECONDS} seconds anyway.`,
    );
    logCommand();
    return;
  }

  // Same two slots as /convert and /ytdlp: generation is CPU-bound on the box
  // the bot itself runs on, so it queues behind them rather than alongside.
  const release = tryAcquireMediaSlot();
  if (!release) {
    await interaction.reply(
      "I'm already chewing through as much audio as I can handle. Give me a minute and try again.",
    );
    logCommand();
    return;
  }

  await interaction.deferReply();

  const deadline = createJobDeadline();
  const workspace = await createMediaWorkspace();
  const limitBytes = uploadLimitBytes(interaction.guild?.premiumTier);

  try {
    const speakerFile = await resolveSpeakerFile({
      voiceSample: voice?.samplePath,
      clip,
      workDir: workspace.dir,
      deadline,
      interaction,
    });

    const describedVoice = voice
      ? voice.label
      : clip
        ? `the voice in \`${clip.name}\``
        : "my default voice";

    await interaction.editReply(`Saying that in ${describedVoice}...`);

    const outputBase = safeFileBase(
      `${interaction.user.username}-${voice?.name ?? "tts"}`,
      "tts",
    );

    const spoken = await synthesizeSpeech({
      text,
      outputDir: workspace.dir,
      outputBase,
      speakerFile,
      language,
      timeoutMs: deadline.budget(SYNTHESIS_TIMEOUT_MS),
    });

    // mp3 is in the shared format registry, so the encode, the size squeeze and
    // the link fallback are the same code paths /convert uses.
    const mp3 = findMediaFormat("mp3")!;
    const probe = await probeMedia(spoken.path, deadline.budget(30_000));

    const encoded = await convertToFit(
      {
        input: spoken.path,
        outputDir: workspace.dir,
        outputBase,
        format: mp3,
        probe,
        timeoutMs: deadline.budget(ENCODE_TIMEOUT_MS),
      },
      limitBytes,
      fitTargetBytes(limitBytes),
    );

    const spokenFor = probe.durationSeconds
      ? ` • ${formatDuration(probe.durationSeconds)}`
      : "";

    if (!encoded.fitted) {
      const shared = await tryPublishFile({
        sourcePath: encoded.qualityPath,
        name: `${outputBase}.mp3`,
        contentType: mp3.mimeType,
      });

      if (shared) {
        await interaction.editReply({
          content: `${quoted(text)}\n${
            shared.url
          }\n-# ${describedVoice} • ${formatBytes(
            shared.bytes,
          )} — too big to attach, so here's a link. Expires ${expiryTimestamp(
            shared.expiresAt,
          )}.`,
        });
        return;
      }

      await interaction.editReply(
        tooLargeMessage(encoded.bytes, limitBytes, mp3),
      );
      return;
    }

    const attachment = new AttachmentBuilder(encoded.path, {
      name: `${outputBase}.mp3`,
    });

    await interaction.editReply({
      content: `${quoted(text)}\n-# ${describedVoice}${spokenFor} • ${formatBytes(
        encoded.bytes,
      )}`,
      files: [attachment],
    });
  } catch (err) {
    console.error("Error running /tts command:", { err });

    await interaction
      .editReply(failureMessage(err))
      .catch((replyErr) =>
        console.error("Error reporting /tts failure:", { replyErr }),
      );
  } finally {
    await workspace.cleanup();
    release();
    logCommand();
  }
};

/**
 * Puts the prompt back in the reply as a quote.
 *
 * Truncated well short of `MAX_TEXT_LENGTH` because the audio is the answer and
 * the text is just context for anyone scrolling past. Multi-line prompts get
 * flattened, so a prompt with newlines cannot break out of the quote and eat
 * the credit line under it.
 * @param text The prompt
 * @returns A single-line Discord block quote
 */
const quoted = (text: string): string => {
  const flattened = text.replace(/\s+/g, " ").trim();

  return `> ${
    flattened.length > 200 ? `${flattened.slice(0, 197)}...` : flattened
  }`;
};

/**
 * Gets the reference clip into the workspace and into the model's format.
 *
 * Both sources end up in the same place for the same reason: ffmpeg runs
 * sandboxed with only the workspace mounted, so whatever it normalises has to
 * be inside the workspace first. A preset is copied there by the bot, and an
 * upload is streamed there from Discord's CDN.
 * @returns Path to the normalised clip, or undefined for the default voice
 */
const resolveSpeakerFile = async ({
  voiceSample,
  clip,
  workDir,
  deadline,
  interaction,
}: {
  voiceSample: string | undefined;
  clip: { name: string | null; url: string } | undefined;
  workDir: string;
  deadline: ReturnType<typeof createJobDeadline>;
  interaction: ChatInputCommandInteraction;
}): Promise<string | undefined> => {
  if (!voiceSample && !clip) return undefined;

  let staged: string;

  if (clip) {
    await interaction.editReply(`Listening to \`${clip.name}\`...`);

    // The extension is kept so ffmpeg's extension-sniffed demuxers still work,
    // and capped so a 200-character filename cannot produce an unopenable path.
    const extension = (clip.name?.match(/\.[^.]+$/)?.[0] ?? "").slice(0, 8);
    staged = join(workDir, `reference${extension}`);

    await downloadToFile(
      clip.url,
      staged,
      MAX_CLIP_BYTES,
      deadline.budget(FETCH_TIMEOUT_MS),
    );
  } else {
    staged = await stageVoiceSample(voiceSample!, workDir);
  }

  const prepared = await prepareSpeakerClip(
    staged,
    workDir,
    deadline.budget(CLIP_PREP_TIMEOUT_MS),
  );

  return prepared.path;
};

/**
 * Turns a failure into something worth reading in the channel.
 *
 * A `ProcessError` from `llama-tts` gets its stderr tail like `/convert` does,
 * but a timeout is reported as the length problem it almost always is rather
 * than as a generic one - the cap on prompt length is generous enough that the
 * way to hit the clock is a long prompt, and "try a shorter one" is the actual
 * fix.
 * @param err Whatever was thrown
 * @returns The reply text
 */
const failureMessage = (err: unknown): string => {
  if (err instanceof TtsUnavailableError) return `Sorry, ${err.message}`;

  if (err instanceof ProcessError) {
    return err.timedOut
      ? `That took longer than I'm willing to spend on it. Try a shorter bit of text - I cap generation at ${MAX_SPEECH_SECONDS} seconds of speech.`
      : `I couldn't say that:\n\`\`\`\n${err.tail()}\n\`\`\``;
  }

  return `I fucked up :(\n${(err as Error).message}`;
};
