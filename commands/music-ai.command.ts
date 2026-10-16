import { SlashCommandBuilder } from "@discordjs/builders";
import { AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import {
  ProcessError,
  convertToFit,
  createJobDeadline,
  createMediaWorkspace,
  findMediaFormat,
  fitTargetBytes,
  formatBytes,
  formatDuration,
  probeMedia,
  safeFileBase,
  tooLargeMessage,
  tryAcquireMediaSlot,
  uploadLimitBytes,
} from "../modules/media";
import { expiryTimestamp, tryPublishFile } from "../modules/fileShare";
import {
  DEFAULT_MUSIC_SECONDS,
  MAX_MUSIC_SECONDS,
  MUSICGEN_SETUP_HINT,
  MusicGenUnavailableError,
  buildMusicPrompt,
  estimateGenerationSeconds,
  generateMusic,
  isMusicGenConfigured,
  styleChoices,
  tempoChoices,
} from "../modules/musicAi";

/**
 * `/music-ai` - generates a short instrumental from a text description.
 *
 * Runs MusicGen Small on the CPU through onnxruntime. The GPU was measured and
 * is slower here - WebGPU works on this card but has no int8 kernels, so the
 * quantised weights fall back to the CPU anyway. See `modules/music-ai` for
 * the full table.
 *
 * The output is transcoded to mp3 rather than posted as the 32kHz mono wav the
 * generator writes. That is 64KB per second, so fifteen seconds is a 960KB wav
 * against about 120KB of mp3 - and Discord plays an mp3 inline where it makes
 * people download a wav.
 *
 * `style` and `tempo` are not parameters the model has. They are appended to
 * the caption the text encoder reads, which is why they compose freely rather
 * than being mutually exclusive.
 */

/**
 * Longest description accepted.
 *
 * Shorter than `/tts`'s cap because length does nothing for a caption here.
 * MusicGen's text encoder was trained on one-line descriptions - "90s rock
 * song with loud guitars" - and a paragraph does not describe the music more
 * precisely, it just dilutes the words that were doing the work.
 */
const MAX_PROMPT_LENGTH = 300;

/**
 * Shortest clip worth generating.
 *
 * Model load is a flat ~12 seconds whatever the length, so anything under
 * this spends most of its wall clock on setup for a clip too short to have a
 * second bar.
 */
const MIN_MUSIC_SECONDS = 5;

/**
 * Cap on the generation subprocess.
 *
 * The longest legal request measures at about 68 seconds of wall clock on an
 * idle-ish box, so this is roughly 4x the worst legitimate case. The margin is
 * that wide because the thing that makes a generation slow here is memory
 * pressure from whatever else the host is doing, which can stretch it a long
 * way without it being stuck. Short enough, still, that a wedged process does
 * not sit on a media slot for the whole job budget.
 */
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 30_000;
const ENCODE_TIMEOUT_MS = 60_000;

export const data = new SlashCommandBuilder()
  .setName("music-ai")
  .setDescription("Generate a short instrumental from a description")
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("Describe the music you want")
      .setRequired(true)
      .setMaxLength(MAX_PROMPT_LENGTH),
  )
  .addStringOption((option) =>
    option
      .setName("style")
      .setDescription("Genre to steer towards")
      .setRequired(false)
      .addChoices(...styleChoices()),
  )
  .addStringOption((option) =>
    option
      .setName("tempo")
      .setDescription("How fast it should be")
      .setRequired(false)
      .addChoices(...tempoChoices()),
  )
  .addIntegerOption((option) =>
    option
      .setName("length")
      .setDescription(
        `Seconds of audio (${MIN_MUSIC_SECONDS}-${MAX_MUSIC_SECONDS}, default ${DEFAULT_MUSIC_SECONDS})`,
      )
      .setRequired(false)
      .setMinValue(MIN_MUSIC_SECONDS)
      .setMaxValue(MAX_MUSIC_SECONDS),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const description =
    interaction.options.get("prompt")?.value?.toString().trim() ?? "";
  const style = interaction.options.get("style")?.value?.toString();
  const tempo = interaction.options.get("tempo")?.value?.toString();
  const requested = Number(interaction.options.get("length")?.value);

  const seconds = Number.isFinite(requested)
    ? Math.min(Math.max(requested, MIN_MUSIC_SECONDS), MAX_MUSIC_SECONDS)
    : DEFAULT_MUSIC_SECONDS;

  if (!description) {
    await interaction.reply("You have to tell me what to write.");
    logCommand();
    return;
  }

  // Checked before the slot and the defer, so a host that never ran the setup
  // script says so immediately instead of after a spinner.
  if (!isMusicGenConfigured()) {
    await interaction.reply(`Sorry, ${MUSICGEN_SETUP_HINT}`);
    logCommand();
    return;
  }

  // Same two slots as /convert, /ytdlp and /tts: generation is CPU-bound on
  // the box the bot itself runs on, and peaks around 3GB resident, so it
  // queues behind them rather than alongside.
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
    const prompt = buildMusicPrompt({ description, style, tempo });

    await interaction.editReply(
      `Writing you ${seconds} seconds of music - give me about ${estimateGenerationSeconds(
        seconds,
      )}s...`,
    );

    const outputBase = safeFileBase(
      `${interaction.user.username}-music`,
      "music",
    );

    const generated = await generateMusic({
      prompt,
      outputDir: workspace.dir,
      outputBase,
      seconds,
      timeoutMs: deadline.budget(GENERATION_TIMEOUT_MS),
    });

    // mp3 is in the shared format registry, so the encode, the size squeeze
    // and the link fallback are the same code paths /convert and /tts use.
    const mp3 = findMediaFormat("mp3")!;
    const probe = await probeMedia(
      generated.path,
      deadline.budget(PROBE_TIMEOUT_MS),
    );

    const encoded = await convertToFit(
      {
        input: generated.path,
        outputDir: workspace.dir,
        outputBase,
        format: mp3,
        probe,
        timeoutMs: deadline.budget(ENCODE_TIMEOUT_MS),
      },
      limitBytes,
      fitTargetBytes(limitBytes),
    );

    const ranFor = probe.durationSeconds
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
          content: `${quoted(prompt)}\n${shared.url}\n-# ${formatBytes(
            shared.bytes,
          )}${ranFor} — too big to attach, so here's a link. Expires ${expiryTimestamp(
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
      content: `${quoted(prompt)}\n-# MusicGen Small${ranFor} • ${formatBytes(
        encoded.bytes,
      )}`,
      files: [attachment],
    });
  } catch (err) {
    console.error("Error running /music-ai command:", { err });

    await interaction
      .editReply(failureMessage(err))
      .catch((replyErr) =>
        console.error("Error reporting /music-ai failure:", { replyErr }),
      );
  } finally {
    await workspace.cleanup();
    release();
    logCommand();
  }
};

/**
 * Puts the caption back in the reply as a quote.
 *
 * The built caption rather than the raw description, because the style and
 * tempo picks are part of what produced the audio and reading them back is
 * how someone works out which knob to turn next.
 * @param text The caption
 * @returns A single-line Discord block quote
 */
const quoted = (text: string): string => {
  const flattened = text.replace(/\s+/g, " ").trim();

  return `> ${
    flattened.length > 200 ? `${flattened.slice(0, 197)}...` : flattened
  }`;
};

/**
 * Turns a failure into something worth reading in the channel.
 *
 * A timeout is reported as the length problem it usually is. Unlike `/tts`,
 * where a long prompt is the way to hit the clock, here it is a long `length`
 * on a host that is already busy - so the advice is to ask for less audio
 * rather than fewer words.
 * @param err Whatever was thrown
 * @returns The reply text
 */
const failureMessage = (err: unknown): string => {
  if (err instanceof MusicGenUnavailableError) return `Sorry, ${err.message}`;

  if (err instanceof ProcessError) {
    return err.timedOut
      ? "That took longer than I'm willing to spend on it. Try a shorter `length`."
      : `I couldn't write that:\n\`\`\`\n${err.tail()}\n\`\`\``;
  }

  return `I fucked up :(\n${(err as Error).message}`;
};
