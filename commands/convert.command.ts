import { SlashCommandBuilder } from "@discordjs/builders";
import { AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import { join } from "path";
import {
  DEFAULT_BLEND,
  DEFAULT_SIMILARITY,
  MAX_BLEND,
  MAX_SIMILARITY,
  MIN_BLEND,
  MIN_SIMILARITY,
  NAMED_CHROMA_COLORS,
  ProcessError,
  alphaFormatList,
  buildChromaKey,
  buildTimeRange,
  convertToFit,
  createJobDeadline,
  createMediaWorkspace,
  describeTimeRange,
  downloadToFile,
  findMediaFormat,
  fitTargetBytes,
  formatBytes,
  formatDuration,
  hasTimeRange,
  mediaFormatChoices,
  probeMedia,
  safeFileBase,
  tooLargeMessage,
  tryAcquireMediaSlot,
  uploadLimitBytes,
} from "../modules/media";
import { expiryTimestamp, tryPublishFile } from "../modules/fileShare";

/**
 * `/convert` - re-encodes an attached file into another format, optionally
 * keying a colour out to transparency.
 *
 * The chroma key is the reason the format registry tracks alpha support.
 * Keying into mp4 is not a worse result, it is a wrong one: h264 has no alpha
 * plane, so the pixels that should have gone clear come out black instead, and
 * the user gets a silhouette they have to figure out for themselves. The
 * command refuses that combination up front and says which formats work.
 */

/**
 * Largest attachment accepted.
 *
 * A boosted guild can hand the bot a 100MB file, and it has to land on disk
 * before ffmpeg can read it. Double that is enough headroom for anything
 * Discord itself will accept while still being a real ceiling.
 */
const MAX_INPUT_BYTES = 200 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 3 * 60 * 1000;
const PROBE_TIMEOUT_MS = 45_000;
const CONVERT_TIMEOUT_MS = 6 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("convert")
  .setDescription("Convert a video or audio file to another format")
  .addAttachmentOption((option) =>
    option
      .setName("file")
      .setDescription("The file you want converted")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("format")
      .setDescription("What you want it converted to")
      .setRequired(true)
      .addChoices(...mediaFormatChoices()),
  )
  .addStringOption((option) =>
    option
      .setName("chroma_key")
      .setDescription(
        `Colour to make transparent - a name (${Object.keys(NAMED_CHROMA_COLORS)
          .slice(0, 4)
          .join(", ")}...) or hex like #00ff00`,
      )
      .setRequired(false),
  )
  .addNumberOption((option) =>
    option
      .setName("similarity")
      .setDescription(
        `How close to the colour still counts, ${MIN_SIMILARITY}-${MAX_SIMILARITY} (default ${DEFAULT_SIMILARITY})`,
      )
      .setRequired(false)
      .setMinValue(MIN_SIMILARITY)
      .setMaxValue(MAX_SIMILARITY),
  )
  .addNumberOption((option) =>
    option
      .setName("blend")
      .setDescription(
        `How soft the keyed edges are, ${MIN_BLEND}-${MAX_BLEND} (default ${DEFAULT_BLEND})`,
      )
      .setRequired(false)
      .setMinValue(MIN_BLEND)
      .setMaxValue(MAX_BLEND),
  )
  .addStringOption((option) =>
    option
      .setName("start")
      .setDescription("Trim to start here instead of the beginning, e.g. 1:20")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("end")
      .setDescription("Trim to end here instead of the end, e.g. 2:45")
      .setRequired(false),
  );

/** Strips the extension off an attachment name for reuse as the output base. */
const baseNameOf = (name: string | undefined): string =>
  safeFileBase((name ?? "").replace(/\.[^.]+$/, ""), "converted");

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const file = interaction.options.get("file")?.attachment;
  const formatValue = interaction.options.get("format")?.value?.toString();
  const chromaValue = interaction.options.get("chroma_key")?.value?.toString();
  const similarity = interaction.options.get("similarity")?.value;
  const blend = interaction.options.get("blend")?.value;
  const startValue = interaction.options.get("start")?.value?.toString();
  const endValue = interaction.options.get("end")?.value?.toString();

  if (!file) {
    await interaction.reply("You have to actually attach a file.");
    logCommand();
    return;
  }

  const format = findMediaFormat(formatValue);
  if (!format) {
    await interaction.reply("I don't know that format.");
    logCommand();
    return;
  }

  const chromaKey =
    (chromaValue
      ? buildChromaKey(chromaValue, Number(similarity), Number(blend))
      : undefined) ?? undefined;

  if (chromaValue && !chromaKey) {
    await interaction.reply(
      `I don't recognise "${chromaValue}" as a colour. Use a name (${Object.keys(
        NAMED_CHROMA_COLORS,
      ).join(", ")}) or hex like #00ff00.`,
    );
    logCommand();
    return;
  }

  if (chromaKey && !format.supportsAlpha) {
    await interaction.reply(
      `${
        format.value
      } can't hold transparency, so keying a colour out of it would just turn those pixels black. Pick one of: ${alphaFormatList()}.`,
    );
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

  if (file.size > MAX_INPUT_BYTES) {
    await interaction.reply(
      `That file is ${formatBytes(file.size)} and I cap at ${formatBytes(
        MAX_INPUT_BYTES,
      )}.`,
    );
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
    await interaction.editReply(`Fetching \`${file.name}\`...`);

    // Keep the source extension: ffmpeg's demuxer probing is good, but a few
    // formats (raw AAC, some MPEG-TS) are detected by extension.
    const sourceExtension = (file.name?.match(/\.[^.]+$/)?.[0] ?? "").slice(
      0,
      8,
    );
    const input = join(workspace.dir, `input${sourceExtension}`);

    await downloadToFile(
      file.url,
      input,
      MAX_INPUT_BYTES,
      deadline.budget(FETCH_TIMEOUT_MS),
    );

    const probe = await probeMedia(input, deadline.budget(PROBE_TIMEOUT_MS));

    if (format.kind === "video" && !probe.hasVideo) {
      await interaction.editReply(
        `There's no video in \`${file.name}\`, so I can't make a ${format.value} out of it. Ask for an audio format instead.`,
      );
      return;
    }

    if (format.kind === "audio" && !probe.hasAudio) {
      await interaction.editReply(
        `There's no audio in \`${file.name}\` to convert.`,
      );
      return;
    }

    // A trim starting past the end of the file produces an empty output, and
    // ffmpeg calls that a success - the user would get a zero byte attachment
    // with no explanation.
    if (
      probe.durationSeconds &&
      trim.startSeconds !== undefined &&
      trim.startSeconds >= probe.durationSeconds
    ) {
      await interaction.editReply(
        `That starts at ${formatDuration(trim.startSeconds)} but \`${
          file.name
        }\` is only ${formatDuration(probe.durationSeconds)} long.`,
      );
      return;
    }

    const span = hasTimeRange(trim) ? describeTimeRange(trim) : "";

    await interaction.editReply(
      `Converting \`${file.name}\` to ${format.value}${
        span ? `, trimmed to ${span}` : ""
      }${chromaKey ? ` and keying out ${chromaKey.color}` : ""}...`,
    );

    const outputBase = baseNameOf(file.name);

    const converted = await convertToFit(
      {
        input,
        outputDir: workspace.dir,
        outputBase,
        format,
        probe,
        chromaKey,
        trim,
        timeoutMs: deadline.budget(CONVERT_TIMEOUT_MS),
      },
      limitBytes,
      fitTargetBytes(limitBytes),
    );

    if (!converted.fitted) {
      // The link carries the full-quality encode, not the squeezed one - the
      // squeeze only existed to satisfy an uploader we are no longer using.
      const shared = await tryPublishFile({
        sourcePath: converted.qualityPath,
        name: `${outputBase}.${format.value}`,
        contentType: format.mimeType,
      });

      if (shared) {
        await interaction.editReply({
          content: `\`${file.name}\` → **${format.value}**${
            span ? `, trimmed to ${span}` : ""
          }\n${shared.url}\n-# ${formatBytes(
            shared.bytes,
          )} — too big to attach, so here's a link. Expires ${expiryTimestamp(
            shared.expiresAt,
          )}.${chromaKey ? ` Keyed ${chromaKey.color} out.` : ""}`,
        });
        return;
      }

      await interaction.editReply(
        tooLargeMessage(converted.bytes, limitBytes, format),
      );
      return;
    }

    const attachment = new AttachmentBuilder(converted.path, {
      name: `${outputBase}.${format.value}`,
    });

    await interaction.editReply({
      content: `\`${file.name}\` → **${format.value}**\n-# ${formatBytes(
        converted.bytes,
      )}${span ? ` • ${span}` : ""}${
        chromaKey ? ` • keyed ${chromaKey.color} out` : ""
      }${
        converted.squeezedTo
          ? ` • squeezed to ${converted.squeezedTo} to fit`
          : ""
      }`,
      files: [attachment],
    });
  } catch (err) {
    console.error("Error running /convert command:", { err });

    const message =
      err instanceof ProcessError
        ? `${
            err.timedOut ? "That took too long" : "ffmpeg couldn't do that"
          }:\n\`\`\`\n${err.tail()}\n\`\`\``
        : `I fucked up :(\n${(err as Error).message}`;

    await interaction
      .editReply(message)
      .catch((replyErr) =>
        console.error("Error reporting /convert failure:", { replyErr }),
      );
  } finally {
    await workspace.cleanup();
    release();
    logCommand();
  }
};
