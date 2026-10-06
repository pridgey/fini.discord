import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
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
  CatalogueVoice,
  DEFAULT_LANGUAGE,
  MAX_SPEECH_SECONDS,
  MAX_VOICE_NAME_LENGTH,
  REFERENCE_SECONDS,
  TTS_LANGUAGES,
  TTS_SETUP_HINT,
  TtsUnavailableError,
  VoiceUsage,
  deleteSavedVoice,
  findCatalogueVoice,
  findDuplicateVoice,
  getVoiceUsage,
  hashClip,
  isTtsConfigured,
  normaliseVoiceName,
  prepareSpeakerClip,
  rankVoices,
  recordVoiceUse,
  saveVoice,
  stageSavedVoice,
  stageVoiceSample,
  stageVoiceTranscript,
  stashPendingVoice,
  synthesizeSpeech,
  transcribeReference,
  voiceCatalogue,
  voiceChoice,
  voiceNameProblem,
} from "../modules/tts";
import { saveVoiceRow } from "../buttons/individualButtons/tts_save_voice.button";

/**
 * `/tts` - speaks text in a preset voice, a saved one, or one cloned from a
 * clip, and manages the saved ones.
 *
 * Runs qwentts.cpp's `qwen-tts` against Qwen3-TTS. The interesting property of
 * that model for this command is that a voice is not a trained model but a few
 * seconds of reference audio - which is what lets the presets ship in the repo
 * as eight small mp3s, and lets anyone add a voice for one message by attaching
 * a clip.
 *
 * A voice is audio *and its transcript*, though, and the transcript is not a
 * nicety: it is what puts the reference in the model's context as a worked
 * example rather than collapsing it into a speaker embedding, and it is the
 * difference between GLaDOS and a woman who is not GLaDOS. Presets ship one.
 * An upload gets one from whisper, and falls back to the embedding-only voice
 * when that is unavailable.
 *
 * The output is transcoded to mp3 rather than posted as the wav `qwen-tts`
 * writes. 24kHz mono PCM is 48KB per second, so a minute of speech is a 2.8MB
 * wav against about 300KB of mp3 - and Discord plays an mp3 inline where it
 * makes people download a wav.
 *
 * Saved voices are shared across every server, and there can be any number of
 * them, so the `voice` option is autocomplete rather than a fixed choice list.
 * Before anything is typed it offers the 25 voices this server uses most;
 * typing searches all of them. See `savedVoices.ts`.
 */

/**
 * Longest prompt accepted.
 *
 * Generation is roughly 0.37x realtime on CPU, so this is the knob that
 * decides whether `/tts` answers in fifteen seconds or four minutes. 600
 * characters is a long paragraph - around 40 seconds of speech, so under two
 * minutes of compute. `MAX_SPEECH_SECONDS` is the backstop underneath it.
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
/**
 * Cap on transcribing an uploaded clip.
 *
 * Covers both passes - the 16kHz downmix and whisper itself - on at most
 * `REFERENCE_SECONDS` of audio. Generous because it is bounded work on a box
 * that may be busy, and because running out of clock here is not fatal: the
 * generation carries on without a transcript.
 */
const TRANSCRIBE_TIMEOUT_MS = 120_000;
const SYNTHESIS_TIMEOUT_MS = 8 * 60 * 1000;
const ENCODE_TIMEOUT_MS = 60_000;

/** Longest transcript accepted with `/tts save`. */
const MAX_TRANSCRIPT_LENGTH = 1000;

/** How much of `/tts voices` fits in one message, leaving room for the footer. */
const VOICE_LIST_BUDGET = 1800;

/**
 * Every subcommand's required options come first - Discord rejects a command
 * whose required options come after its optional ones.
 */
const builder = new SlashCommandBuilder()
  .setName("tts")
  .setDescription("Make Fini say things in all kinds of voices")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("say")
      .setDescription("Create some audio from text")
      .addStringOption((option) =>
        option
          .setName("text")
          .setDescription("The text you want me to speak")
          .setRequired(true)
          .setMaxLength(MAX_TEXT_LENGTH),
      )
      .addStringOption((option) =>
        option
          .setName("voice")
          .setDescription(
            "Whose voice to use - type to search every saved voice",
          )
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addAttachmentOption((option) =>
        option
          .setName("clip")
          .setDescription(
            `Audio of a voice to imitate instead - the first ${REFERENCE_SECONDS} seconds are used`,
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("language")
          .setDescription("What language the text is in (default English)")
          .setRequired(false)
          .addChoices(...TTS_LANGUAGES),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("save")
      .setDescription("Save a voice from a clip, for anyone to use")
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("What to call the voice")
          .setRequired(true)
          .setMaxLength(MAX_VOICE_NAME_LENGTH),
      )
      .addAttachmentOption((option) =>
        option
          .setName("clip")
          .setDescription(
            `Audio of the voice - the first ${REFERENCE_SECONDS} seconds are used`,
          )
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("transcript")
          .setDescription(
            "Exactly what the clip says - I'll work it out if you leave this empty",
          )
          .setRequired(false)
          .setMaxLength(MAX_TRANSCRIPT_LENGTH),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("voices")
      .setDescription("Browse the saved voices")
      .addStringOption((option) =>
        option
          .setName("search")
          .setDescription("Only show voices matching this")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("Delete a voice you saved")
      .addStringOption((option) =>
        option
          .setName("voice")
          .setDescription("The voice to delete")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  );

export const data = builder;

/**
 * Fills in the `voice` option, for `say` and for `delete`.
 *
 * `say` offers the whole catalogue through `rankVoices`: this server's most
 * used voices before anything is typed, the best matches from everywhere
 * after. `delete` only offers voices the person asking saved, since those are
 * the only ones it will delete.
 * @param interaction The autocomplete interaction to respond to
 */
export const autocomplete = async (interaction: AutocompleteInteraction) => {
  const typed = interaction.options.getFocused()?.toString() ?? "";
  const subcommand = interaction.options.getSubcommand(false);

  const [catalogue, usage] = await Promise.all([
    voiceCatalogue(),
    getVoiceUsage(interaction.guildId ?? "unknown").catch((err): VoiceUsage => {
      console.error("Error reading TTS voice usage:", { err });
      return new Map();
    }),
  ]);

  const offered =
    subcommand === "delete"
      ? catalogue.filter(
          (voice) =>
            voice.kind === "saved" &&
            voice.record.user_id === interaction.user.id,
        )
      : catalogue;

  await interaction.respond(
    rankVoices(offered, usage, typed).map((voice) => voiceChoice(voice, usage)),
  );
};

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  switch (interaction.options.getSubcommand()) {
    case "save":
      return save(interaction, logCommand);
    case "voices":
      return listVoices(interaction, logCommand);
    case "delete":
      return deleteVoice(interaction, logCommand);
    default:
      return say(interaction, logCommand);
  }
};

/** `/tts say` - the speech itself. */
const say = async (
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

  const voice = voiceValue ? await findCatalogueVoice(voiceValue) : undefined;

  // The option is free text with suggestions, not a fixed list, so this is
  // anything from a typo to a voice deleted since the picker showed it - and
  // falling through would silently use the default voice instead of the one
  // that was asked for.
  if (voiceValue && !voice) {
    await interaction.reply(
      `I don't have a voice called "${voiceValue}". Start typing in \`voice\` to search them, or browse with \`/tts voices\`.`,
    );
    logCommand();
    return;
  }

  // Both would mean picking one and ignoring the other, and whichever way that
  // went it would look like the command had misheard.
  if (voice && clip) {
    await interaction.reply(
      "Pick one - a voice or a clip to imitate, not both.",
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
    const { speakerFile, speakerTextFile, transcript } =
      await resolveSpeakerFile({
        voice,
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
      speakerTextFile,
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

    // Worked out before the reply goes out because it needs the normalised
    // clip, and the workspace holding it is gone once this returns.
    const offer =
      clip && speakerFile
        ? await saveOffer(speakerFile, transcript)
        : NO_SAVE_OFFER;

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
          )}${offer.note} — too big to attach, so here's a link. Expires ${expiryTimestamp(
            shared.expiresAt,
          )}.`,
          components: offer.components,
        });
        await countUse(interaction, voice);
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
      )}${offer.note}`,
      files: [attachment],
      components: offer.components,
    });

    await countUse(interaction, voice);
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
 * Gets the reference clip into the workspace, into the model's format, and
 * paired with a transcript where there is one to be had.
 *
 * The clip and the transcript both end up in the workspace for the same
 * reason: ffmpeg and `qwen-tts` run sandboxed with only the workspace
 * writable, so anything either of them reads has to be inside it first. A
 * preset is copied there by the bot, a saved voice is fetched from Pocketbase,
 * and an upload is streamed there from Discord's CDN.
 *
 * The transcript is where the sources stop being alike. A preset ships one
 * next to the clip, hand-checked, and a saved voice carries the one it was
 * saved with. An upload has only audio, so the words have to be read back out
 * of it - which is whisper, and which is slow enough to be worth its own line
 * in the reply. Either way a missing transcript is not an error: it drops the
 * generation to x-vector-only conditioning, which is a worse voice rather than
 * no voice.
 * @returns The normalised clip and its transcript, if any
 */
const resolveSpeakerFile = async ({
  voice,
  clip,
  workDir,
  deadline,
  interaction,
}: {
  voice: CatalogueVoice | undefined;
  clip: { name: string | null; url: string } | undefined;
  workDir: string;
  deadline: ReturnType<typeof createJobDeadline>;
  interaction: ChatInputCommandInteraction;
}): Promise<{
  speakerFile?: string;
  speakerTextFile?: string;
  transcript?: string;
}> => {
  if (voice?.kind === "preset") {
    const prepared = await prepareSpeakerClip(
      await stageVoiceSample(voice.preset.samplePath, workDir),
      workDir,
      deadline.budget(CLIP_PREP_TIMEOUT_MS),
    );

    return {
      speakerFile: prepared.path,
      speakerTextFile: voice.preset.transcriptPath
        ? await stageVoiceTranscript(voice.preset.transcriptPath, workDir)
        : undefined,
    };
  }

  if (voice?.kind === "saved") {
    const staged = await stageSavedVoice(
      voice.record,
      workDir,
      deadline.budget(FETCH_TIMEOUT_MS),
    );

    const prepared = await prepareSpeakerClip(
      staged.clipPath,
      workDir,
      deadline.budget(CLIP_PREP_TIMEOUT_MS),
    );

    return {
      speakerFile: prepared.path,
      speakerTextFile: staged.transcriptPath,
    };
  }

  if (!clip) return {};

  await interaction.editReply(`Listening to \`${clip.name}\`...`);

  const prepared = await prepareUpload(clip, workDir, deadline);

  await interaction.editReply(`Working out what \`${clip.name}\` says...`);

  const transcript = await transcribeReference(
    prepared,
    workDir,
    deadline.budget(TRANSCRIBE_TIMEOUT_MS),
  );

  return {
    speakerFile: prepared,
    speakerTextFile: transcript?.path,
    transcript: transcript?.text,
  };
};

/**
 * Downloads an uploaded clip into the workspace and normalises it.
 * @returns Path to the normalised clip
 */
const prepareUpload = async (
  clip: { name: string | null; url: string },
  workDir: string,
  deadline: ReturnType<typeof createJobDeadline>,
): Promise<string> => {
  // The extension is kept so ffmpeg's extension-sniffed demuxers still work,
  // and capped so a 200-character filename cannot produce an unopenable path.
  const extension = (clip.name?.match(/\.[^.]+$/)?.[0] ?? "").slice(0, 8);
  const staged = join(workDir, `reference${extension}`);

  await downloadToFile(
    clip.url,
    staged,
    MAX_CLIP_BYTES,
    deadline.budget(FETCH_TIMEOUT_MS),
  );

  const prepared = await prepareSpeakerClip(
    staged,
    workDir,
    deadline.budget(CLIP_PREP_TIMEOUT_MS),
  );

  return prepared.path;
};

type SaveOffer = {
  /** Appended to the credit line. */
  note: string;
  components: ActionRowBuilder<ButtonBuilder>[];
};

const NO_SAVE_OFFER: SaveOffer = { note: "", components: [] };

/**
 * What to say under a reply that used an uploaded clip.
 *
 * A clip that is already saved gets pointed at the saved voice instead of a
 * button, which is most of what keeps the same voice from being saved under
 * five names. Anything else is stashed for a day behind a "Save voice" button.
 *
 * Never throws: the speech is the answer, and failing to offer to keep the
 * voice is no reason not to post it.
 * @param speakerFile The normalised clip
 * @param transcript What whisper heard in it
 * @returns The note and button to attach
 */
const saveOffer = async (
  speakerFile: string,
  transcript: string | undefined,
): Promise<SaveOffer> => {
  try {
    const clipHash = await hashClip(speakerFile);
    const duplicate = await findDuplicateVoice({ clipHash, transcript });

    if (duplicate) {
      return {
        note: ` • that's **${duplicate.label}**, use \`voice: ${duplicate.name}\` next time`,
        components: [],
      };
    }

    const pendingId = await stashPendingVoice({
      clipPath: speakerFile,
      clipHash,
      transcript,
    });

    return { note: "", components: [saveVoiceRow(pendingId)] };
  } catch (err) {
    console.error("Error offering to save TTS voice:", { err });
    return NO_SAVE_OFFER;
  }
};

/** Counts a use towards this server's picker order. */
const countUse = async (
  interaction: ChatInputCommandInteraction,
  voice: CatalogueVoice | undefined,
): Promise<void> => {
  if (voice && interaction.guildId) {
    await recordVoiceUse(interaction.guildId, voice);
  }
};

/**
 * `/tts save` - saves a clip as a voice without speaking anything first.
 *
 * The same work `say` does on an upload, minus the generation: download,
 * normalise, transcribe. It takes a media slot for the same reason - whisper
 * is not cheap - but not the TTS model, so it works on a host where only
 * ffmpeg is installed.
 */
const save = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const name = normaliseVoiceName(
    interaction.options.get("name")?.value?.toString() ?? "",
  );
  const clip = interaction.options.get("clip")?.attachment;
  const givenTranscript = interaction.options
    .get("transcript")
    ?.value?.toString()
    .trim();

  // The cheap refusals come before the slot and the defer, so a bad name or a
  // taken one is answered immediately rather than after a download.
  const problem =
    voiceNameProblem(name) ??
    (!clip ? "I need a clip of the voice." : undefined) ??
    (clip && clip.size > MAX_CLIP_BYTES
      ? `That clip is ${formatBytes(clip.size)} and I cap at ${formatBytes(
          MAX_CLIP_BYTES,
        )}. I only use the first ${REFERENCE_SECONDS} seconds anyway.`
      : undefined);

  if (problem) {
    await interaction.reply(problem);
    logCommand();
    return;
  }

  const taken = await findCatalogueVoice(name);
  if (taken) {
    await interaction.reply(
      `There's already a voice called **${taken.label}**. Pick another name.`,
    );
    logCommand();
    return;
  }

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

  try {
    await interaction.editReply(`Listening to \`${clip!.name}\`...`);

    const prepared = await prepareUpload(clip!, workspace.dir, deadline);

    let transcript = givenTranscript;
    if (!transcript) {
      await interaction.editReply(`Working out what \`${clip!.name}\` says...`);

      transcript = (
        await transcribeReference(
          prepared,
          workspace.dir,
          deadline.budget(TRANSCRIBE_TIMEOUT_MS),
        )
      )?.text;
    }

    const result = await saveVoice({
      name,
      clipPath: prepared,
      clipHash: await hashClip(prepared),
      transcript,
      userId: interaction.user.id,
      serverId: interaction.guildId ?? "unknown",
    });

    if (!result.ok) {
      await interaction.editReply(result.message);
      return;
    }

    await interaction.editReply(
      `🎙️ Saved **${result.voice.label}**. Anyone can use it with \`/tts say voice: ${result.voice.name}\`.${
        transcript
          ? ""
          : "\n-# I couldn't make out what the clip says, so it'll sound less like them. Delete it and save it again with a `transcript` to fix that."
      }`,
    );
  } catch (err) {
    console.error("Error running /tts save:", { err });

    await interaction
      .editReply(failureMessage(err))
      .catch((replyErr) =>
        console.error("Error reporting /tts save failure:", { replyErr }),
      );
  } finally {
    await workspace.cleanup();
    release();
    logCommand();
  }
};

/**
 * `/tts voices` - the catalogue, most used here first.
 *
 * Ephemeral, because it is a lookup rather than something the channel needs
 * to see, and plain text cut at one message rather than paginated: with
 * hundreds of voices, `search` narrows it faster than paging would.
 */
const listVoices = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const search = interaction.options.get("search")?.value?.toString() ?? "";

  try {
    const [catalogue, usage] = await Promise.all([
      voiceCatalogue(),
      getVoiceUsage(interaction.guildId ?? "unknown"),
    ]);

    const voices = rankVoices(catalogue, usage, search, Infinity);

    if (!voices.length) {
      await interaction.reply({
        content: search
          ? `No voices match "${search}".`
          : "There aren't any voices yet. Save one with `/tts save`.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const lines: string[] = [];
    let length = 0;

    for (const voice of voices) {
      const uses = usage.get(voice.key)?.uses ?? 0;
      const line = `- **${voice.label}**${
        voice.kind === "preset"
          ? " · preset"
          : ` · by <@${voice.record.user_id}>`
      }${uses ? ` · used ${uses}× here` : ""}`;

      if (length + line.length + 1 > VOICE_LIST_BUDGET) break;

      lines.push(line);
      length += line.length + 1;
    }

    const hidden = voices.length - lines.length;
    const header = search
      ? `**${voices.length}** voice${voices.length === 1 ? "" : "s"} matching "${search}":`
      : `**${voices.length}** voices, most used here first:`;

    await interaction.reply({
      content: [
        header,
        ...lines,
        hidden
          ? `-# ...and ${hidden} more. Narrow it down with \`search\`.`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      flags: [MessageFlags.Ephemeral],
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("Error running /tts voices:", { err });
    await interaction.reply({
      content: failureMessage(err),
      flags: [MessageFlags.Ephemeral],
    });
  } finally {
    logCommand();
  }
};

/** `/tts delete` - removes a voice, if the person asking saved it. */
const deleteVoice = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const name = interaction.options.get("voice")?.value?.toString() ?? "";

  try {
    const outcome = await deleteSavedVoice(name, interaction.user.id);

    await interaction.reply({
      content: {
        deleted: `Deleted **${normaliseVoiceName(name)}**.`,
        missing: `I don't have a voice called "${name}".`,
        preset: "That one ships with me - it can't be deleted.",
        "not-yours": "You can only delete voices you saved.",
      }[outcome],
      flags: outcome === "deleted" ? [] : [MessageFlags.Ephemeral],
    });
  } catch (err) {
    console.error("Error running /tts delete:", { err });
    await interaction.reply({
      content: failureMessage(err),
      flags: [MessageFlags.Ephemeral],
    });
  } finally {
    logCommand();
  }
};

/**
 * Turns a failure into something worth reading in the channel.
 *
 * A `ProcessError` from `qwen-tts` gets its stderr tail like `/convert` does,
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
