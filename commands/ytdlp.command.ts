import { SlashCommandBuilder } from "@discordjs/builders";
import { AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import {
  MAX_DURATION_SECONDS,
  ProcessError,
  buildTimeRange,
  convertToFit,
  createJobDeadline,
  createMediaWorkspace,
  describeTimeRange,
  downloadFromUrl,
  fileSize,
  findMediaFormat,
  formatBytes,
  formatDuration,
  fitTargetBytes,
  hasTimeRange,
  mediaFormatChoices,
  checkHostSafety,
  parseMediaUrl,
  probeMedia,
  probeUrl,
  rangeDurationSeconds,
  safeFileBase,
  tooLargeMessage,
  tryAcquireMediaSlot,
  uploadLimitBytes,
} from "../modules/media";
import {
  expiryTimestamp,
  isSharingEnabled,
  tryPublishFile,
} from "../modules/fileShare";

/**
 * `/ytdlp` - hands back a url's video or audio as a Discord attachment.
 *
 * The interesting constraint is not the download, it is the upload limit: an
 * unboosted guild takes 10MB, which is about a minute of 720p. So the command
 * defaults to a resolution that usually fits, and re-encodes smaller when it
 * does not, rather than reporting a file it cannot deliver.
 */

/** Default resolution cap. See `QUALITY_CHOICES` for why 720. */
const DEFAULT_MAX_HEIGHT = 720;

const QUALITY_CHOICES = [
  { name: "Best available", value: "best" },
  { name: "1080p", value: "1080" },
  { name: "720p (default)", value: "720" },
  { name: "480p", value: "480" },
  { name: "360p", value: "360" },
];

/** Per-stage caps, all further limited by the job's overall deadline. */
const PROBE_TIMEOUT_MS = 45_000;
const DOWNLOAD_TIMEOUT_MS = 6 * 60 * 1000;
const CONVERT_TIMEOUT_MS = 5 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("ytdlp")
  .setDescription("Grab the video or audio from a url")
  .addStringOption((option) =>
    option
      .setName("url")
      .setDescription("Link to the video or track you want")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("format")
      .setDescription("What you want back (defaults to mp4)")
      .setRequired(false)
      .addChoices(...mediaFormatChoices()),
  )
  .addStringOption((option) =>
    option
      .setName("quality")
      .setDescription("Resolution cap for video (defaults to 720p)")
      .setRequired(false)
      .addChoices(...QUALITY_CHOICES),
  )
  .addStringOption((option) =>
    option
      .setName("start")
      .setDescription("Start here instead of the beginning, e.g. 1:20")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("end")
      .setDescription("Stop here instead of the end, e.g. 2:45")
      .setRequired(false),
  );

/**
 * Turns the quality choice into a height cap.
 * @param value The raw option value
 * @returns A pixel height, or undefined for "best available"
 */
const resolveMaxHeight = (value: string | undefined): number | undefined => {
  if (!value) return DEFAULT_MAX_HEIGHT;
  if (value === "best") return undefined;

  return Number(value) || DEFAULT_MAX_HEIGHT;
};

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const rawUrl = interaction.options.get("url")?.value?.toString() || "";
  const formatValue = interaction.options.get("format")?.value?.toString();
  const qualityValue = interaction.options.get("quality")?.value?.toString();
  const startValue = interaction.options.get("start")?.value?.toString();
  const endValue = interaction.options.get("end")?.value?.toString();

  const url = parseMediaUrl(rawUrl);
  if (!url) {
    await interaction.reply(
      "That doesn't look like a link. I need an http or https url.",
    );
    logCommand();
    return;
  }

  // No format given is the common case, and mp4 is what people mean by "get
  // me that video".
  const format = findMediaFormat(formatValue ?? "mp4");
  if (!format) {
    await interaction.reply("I don't know that format.");
    logCommand();
    return;
  }

  // Not destructured: narrowing the result union is what proves `range` is
  // there once the error branch has returned.
  const requested = buildTimeRange(startValue, endValue);
  if (!requested.ok) {
    await interaction.reply(requested.error);
    logCommand();
    return;
  }

  const trim = requested.range;

  /*
   * yt-dlp fetches whatever it is given, so without this the command is a
   * proxy into this machine and the LAN behind it - see modules/media/
   * urlSafety.ts. Checked before the slot is taken so a rejected url does not
   * occupy one, and before deferring so the reply is immediate.
   */
  const safety = await checkHostSafety(url.hostname);
  if (!safety.safe) {
    await interaction.reply(safety.reason);
    logCommand();
    return;
  }

  const release = tryAcquireMediaSlot();
  if (!release) {
    await interaction.reply(
      "I'm already chewing through as much video as I can handle. Give me a minute and try again.",
    );
    logCommand();
    return;
  }

  await interaction.deferReply();

  const deadline = createJobDeadline();
  const workspace = await createMediaWorkspace();
  const limitBytes = uploadLimitBytes(interaction.guild?.premiumTier);

  try {
    const source = await probeUrl(
      url.toString(),
      deadline.budget(PROBE_TIMEOUT_MS),
      workspace.dir,
    );

    if (source.isLive) {
      await interaction.editReply(
        "That's a live stream, so there's no end to download. Try again once it's over.",
      );
      return;
    }

    // A start past the end of the video downloads nothing at all, and yt-dlp
    // reports that as a successful run with no output rather than an error.
    if (
      source.durationSeconds &&
      trim.startSeconds !== undefined &&
      trim.startSeconds >= source.durationSeconds
    ) {
      await interaction.editReply(
        `That starts at ${formatDuration(
          trim.startSeconds,
        )} but the whole thing is only ${formatDuration(
          source.durationSeconds,
        )} long.`,
      );
      return;
    }

    // The cap applies to what was asked for, not to what it was cut from -
    // forty seconds out of a two hour stream is a small job, and refusing it
    // for the length of the source would be refusing work we can easily do.
    const wantedSeconds = hasTimeRange(trim)
      ? rangeDurationSeconds(trim, source.durationSeconds)
      : source.durationSeconds;

    if (wantedSeconds > MAX_DURATION_SECONDS) {
      await interaction.editReply(
        `That's ${formatDuration(
          wantedSeconds,
        )} long and I cap at ${formatDuration(MAX_DURATION_SECONDS)}.${
          hasTimeRange(trim)
            ? ""
            : " Give me a `start` and `end` if you only want part of it."
        }`,
      );
      return;
    }

    const title = source.title || url.hostname;
    const span = hasTimeRange(trim) ? describeTimeRange(trim) : "";

    await interaction.editReply(
      `Downloading **${title}**${span ? ` (${span})` : ""}${
        !span && source.durationSeconds
          ? ` (${formatDuration(source.durationSeconds)})`
          : ""
      }...`,
    );

    const downloaded = await downloadFromUrl({
      url: url.toString(),
      format,
      maxHeight:
        format.kind === "audio" ? undefined : resolveMaxHeight(qualityValue),
      trim,
      dir: workspace.dir,
      timeoutMs: deadline.budget(DOWNLOAD_TIMEOUT_MS),
    });

    const probe = await probeMedia(
      downloaded,
      deadline.budget(PROBE_TIMEOUT_MS),
    );

    /*
     * A section download is ffmpeg seeking the remote file over HTTP range
     * requests. A host that does not serve ranges cannot be seeked, and the
     * failure is silent in the worst way: ffmpeg writes a valid container with
     * nothing in it, yt-dlp exits zero, and the user gets a 262 byte mp4 with
     * no indication anything went wrong. Comparing what came back against what
     * was asked for is the only way to catch it.
     */
    if (
      hasTimeRange(trim) &&
      wantedSeconds > 0 &&
      probe.durationSeconds < wantedSeconds / 2
    ) {
      await interaction.editReply(
        `I asked that site for ${describeTimeRange(
          trim,
        )} and it gave me ${formatDuration(
          probe.durationSeconds,
        )}. It doesn't support being seeked - try again without \`start\` and \`end\`.`,
      );
      return;
    }

    if (format.videoOnly && !probe.hasVideo) {
      await interaction.editReply(
        `There's no video at that link, so I can't make a ${format.value} out of it. Ask for an audio format instead.`,
      );
      return;
    }

    if (format.kind === "audio" && !probe.hasAudio) {
      await interaction.editReply("There's no audio at that link to pull out.");
      return;
    }

    const outputBase = safeFileBase(title, "download");
    let path = downloaded;
    let bytes = await fileSize(downloaded);
    let squeezedTo: string | undefined;

    // yt-dlp already produced the requested container by merging streams, so
    // as long as it fits there is nothing for ffmpeg to do - and re-encoding
    // a file that is already fine would only cost quality and minutes.
    const alreadyDone = format.nativeContainer && format.kind === "video";

    /**
     * The file is already the requested container and already too big. If it
     * can go out as a link there is nothing to gain from an ffmpeg pass: the
     * squeeze existed to satisfy Discord's uploader, and skipping it saves
     * minutes of re-encoding *and* hands over the better file.
     */
    if (alreadyDone && bytes > limitBytes && isSharingEnabled()) {
      const shared = await tryPublishFile({
        sourcePath: downloaded,
        name: `${outputBase}.${format.value}`,
        contentType: format.mimeType,
      });

      if (shared) {
        await interaction.editReply({
          content: `**${title}**${span ? ` (${span})` : ""}\n${
            shared.url
          }\n-# ${formatBytes(shared.bytes)} ${
            format.value
          } — too big to attach, so here's a link. Expires ${expiryTimestamp(
            shared.expiresAt,
          )}.`,
        });
        return;
      }
    }

    if (!alreadyDone || bytes > limitBytes) {
      await interaction.editReply(
        `Converting **${title}** to ${format.value}${
          bytes > limitBytes
            ? ` and squeezing it under ${formatBytes(limitBytes)}`
            : ""
        }...`,
      );

      const converted = await convertToFit(
        {
          input: downloaded,
          outputDir: workspace.dir,
          outputBase,
          format,
          probe,
          timeoutMs: deadline.budget(CONVERT_TIMEOUT_MS),
        },
        limitBytes,
        fitTargetBytes(limitBytes),
      );

      if (!converted.fitted) {
        // Full-quality encode, not the squeezed one - see /convert for why.
        const shared = await tryPublishFile({
          sourcePath: converted.qualityPath,
          name: `${outputBase}.${format.value}`,
          contentType: format.mimeType,
        });

        if (shared) {
          await interaction.editReply({
            content: `**${title}**${span ? ` (${span})` : ""}\n${
              shared.url
            }\n-# ${formatBytes(shared.bytes)} ${
              format.value
            } — too big to attach, so here's a link. Expires ${expiryTimestamp(
              shared.expiresAt,
            )}.`,
          });
          return;
        }

        await interaction.editReply(
          tooLargeMessage(converted.bytes, limitBytes, format),
        );
        return;
      }

      path = converted.path;
      bytes = converted.bytes;
      squeezedTo = converted.squeezedTo;
    }

    const attachment = new AttachmentBuilder(path, {
      name: `${outputBase}.${format.value}`,
    });

    await interaction.editReply({
      content: `**${title}**\n-# ${formatBytes(bytes)} ${format.value}${
        source.extractor ? ` from ${source.extractor}` : ""
      }${span ? ` • ${span}` : ""}${
        squeezedTo ? ` • squeezed to ${squeezedTo} to fit` : ""
      }`,
      files: [attachment],
    });
  } catch (err) {
    console.error("Error running /ytdlp command:", { err });

    const message =
      err instanceof ProcessError
        ? `${
            err.timedOut ? "That took too long" : "yt-dlp couldn't get that"
          }:\n\`\`\`\n${err.tail()}\n\`\`\``
        : `I fucked up :(\n${(err as Error).message}`;

    await interaction
      .editReply(message)
      .catch((replyErr) =>
        console.error("Error reporting /ytdlp failure:", { replyErr }),
      );
  } finally {
    // The attachment has been read and sent by the time editReply resolves,
    // so the workspace can go.
    await workspace.cleanup();
    release();
    logCommand();
  }
};
