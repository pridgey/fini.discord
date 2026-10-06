import { createHash } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import {
  TtsVoiceRecord,
  TtsVoiceUsageRecord,
} from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";
import { downloadToFile } from "../media/workspace";
import { MAX_VOICE_CHOICES, Voice, availableVoices } from "./voices";

/**
 * Voices people have saved for `/tts`, alongside the presets in `voices.ts`.
 *
 * The catalogue is global - a voice saved in one server can be used in any of
 * them - but popularity is per server. That split is what keeps the picker
 * usable once there are hundreds of voices: before anyone types, a server sees
 * the 25 it actually uses, and typing searches everything.
 *
 * Presets and saved voices share one namespace. A saved voice cannot be called
 * "glados", so a name typed into the `voice` option always means one thing,
 * and the option's value can just be the name.
 */

const VOICES_COLLECTION = "tts_voices";
const USAGE_COLLECTION = "tts_voice_usage";

/**
 * Longest voice name accepted.
 *
 * Short enough to sit in an autocomplete label next to its usage count, and
 * to be typed - a name is also how someone asks for a voice that is not in
 * their server's top 25.
 */
export const MAX_VOICE_NAME_LENGTH = 32;

/**
 * Largest saved clip that will be fetched back.
 *
 * Saved clips are the normalised wav, so 30 seconds of mono 24kHz is about
 * 1.4MB. This leaves headroom without letting a bad record stream forever.
 */
const MAX_SAVED_CLIP_BYTES = 5 * 1024 * 1024;

/**
 * Shortest transcript trusted to identify a clip on its own.
 *
 * Two different clips that both say "yeah" are not the same voice, but two
 * that say the same full sentence almost always are the same clip, re-encoded
 * or re-uploaded from somewhere else.
 */
const MIN_TRANSCRIPT_MATCH_LENGTH = 20;

/**
 * How long the saved list is trusted before it is re-read.
 *
 * Autocomplete fires on every keystroke, so this is what keeps it off the
 * database. The bot drops the cache itself whenever it saves or deletes, so
 * the TTL only matters for edits made in the Pocketbase admin.
 */
const CATALOGUE_TTL_MS = 5 * 60 * 1000;

export type CatalogueVoice =
  | {
      kind: "preset";
      /** Key used in `tts_voice_usage`. */
      key: string;
      /** The option value, and the name people type. */
      name: string;
      label: string;
      preset: Voice;
    }
  | {
      kind: "saved";
      key: string;
      name: string;
      label: string;
      record: TtsVoiceRecord;
    };

/** Per-server usage, keyed by `CatalogueVoice.key`. */
export type VoiceUsage = Map<string, { uses: number; lastUsed: string }>;

const presetEntry = (preset: Voice): CatalogueVoice => ({
  kind: "preset",
  key: `preset:${preset.name}`,
  name: preset.name,
  label: preset.label,
  preset,
});

const savedEntry = (record: TtsVoiceRecord): CatalogueVoice => ({
  kind: "saved",
  key: record.id ?? "",
  name: record.name,
  label: record.name,
  record,
});

let savedCache: { records: TtsVoiceRecord[]; at: number } | undefined;

/**
 * Every saved voice, newest first.
 * @returns The saved voice records
 */
export const listSavedVoices = async (): Promise<TtsVoiceRecord[]> => {
  if (savedCache && Date.now() - savedCache.at < CATALOGUE_TTL_MS) {
    return savedCache.records;
  }

  const records = await pb
    .collection<TtsVoiceRecord>(VOICES_COLLECTION)
    .getFullList({ sort: "-created" });

  savedCache = { records, at: Date.now() };

  return records;
};

/** Drops the cached saved list, after a write or between tests. */
export const resetSavedVoiceCache = (): void => {
  savedCache = undefined;
};

/**
 * Presets in curated order, then saved voices newest first.
 *
 * That order is what fills out the picker for a server that has not used 25
 * voices yet, so a fresh server gets the presets and then whatever is new.
 *
 * With Pocketbase unreachable this is just the presets, rather than a throw:
 * the picker has three seconds to answer and an empty one is worse than a
 * short one.
 * @returns Every voice `/tts` can speak in
 */
export const voiceCatalogue = async (): Promise<CatalogueVoice[]> => {
  const saved = await listSavedVoices().catch((err) => {
    console.error("Error reading saved TTS voices:", { err });
    return [] as TtsVoiceRecord[];
  });

  return [...availableVoices().map(presetEntry), ...saved.map(savedEntry)];
};

/** Collapses whitespace, so "  big   bob " and "big bob" are one name. */
export const normaliseVoiceName = (raw: string): string =>
  raw.replace(/\s+/g, " ").trim();

/**
 * Says what is wrong with a proposed voice name, if anything.
 *
 * The character set is narrow on purpose: a name is typed into a slash command
 * option and quoted back in replies, so markdown and mentions have no business
 * in it.
 * @param name An already-normalised name
 * @returns A reply explaining the problem, or undefined when the name is fine
 */
export const voiceNameProblem = (name: string): string | undefined => {
  if (!name) return "A voice needs a name.";

  if (name.length > MAX_VOICE_NAME_LENGTH) {
    return `Voice names cap at ${MAX_VOICE_NAME_LENGTH} characters.`;
  }

  if (!/^[\p{L}\p{N} ._'-]+$/u.test(name)) {
    return "Stick to letters, numbers, spaces and `- _ . '` in a voice name.";
  }

  return undefined;
};

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const lookUp = async (name: string): Promise<CatalogueVoice | undefined> => {
  const preset = availableVoices().find(
    (voice) => sameName(voice.name, name) || sameName(voice.label, name),
  );
  if (preset) return presetEntry(preset);

  const saved = (await listSavedVoices()).find((record) =>
    sameName(record.name, name),
  );

  return saved ? savedEntry(saved) : undefined;
};

/**
 * Finds a voice by the name in the `voice` option.
 *
 * Case-insensitive, and accepts a preset's label as well as its name, because
 * the value is not always one autocomplete filled in - someone who types
 * "GLaDOS" and sends without picking from the list meant GLaDOS.
 *
 * A miss re-reads the saved list once before giving up, so a voice saved
 * outside this process is found without waiting out the cache.
 * @param value The option value
 * @returns The voice, or undefined when there is no such voice
 */
export const findCatalogueVoice = async (
  value: string,
): Promise<CatalogueVoice | undefined> => {
  const name = normaliseVoiceName(value);
  if (!name) return undefined;

  const found = await lookUp(name);
  if (found || !savedCache) return found;

  resetSavedVoiceCache();

  return lookUp(name);
};

/**
 * How well a voice matches what has been typed so far, 0 for not at all.
 *
 * Exact beats prefix beats a later word's prefix beats anywhere, so "go"
 * offers Gojo and Goku before "Big Goon", and all three before "Ego".
 */
const matchScore = (voice: CatalogueVoice, typed: string): number =>
  Math.max(
    ...[voice.name, voice.label].map((candidate) => {
      const lower = candidate.toLowerCase();

      if (lower === typed) return 4;
      if (lower.startsWith(typed)) return 3;
      if (lower.split(/[\s._'-]+/).some((word) => word.startsWith(typed))) {
        return 2;
      }
      return lower.includes(typed) ? 1 : 0;
    }),
  );

/**
 * Picks the voices to offer in the picker.
 *
 * With nothing typed, the server's most used voices come first, most recent
 * breaking ties, and the rest of the list is filled in catalogue order. With
 * something typed, the whole catalogue is searched - that is how a voice that
 * is not in this server's top 25 gets found - and usage here only breaks ties
 * between equally good matches.
 *
 * Pure, so the ranking can be tested without a database.
 * @param catalogue Every voice, in catalogue order
 * @param usage This server's usage
 * @param query What has been typed into the option so far
 * @param limit How many to return
 * @returns The voices to offer, best first
 */
export const rankVoices = (
  catalogue: CatalogueVoice[],
  usage: VoiceUsage,
  query: string,
  limit = MAX_VOICE_CHOICES,
): CatalogueVoice[] => {
  const uses = (voice: CatalogueVoice) => usage.get(voice.key)?.uses ?? 0;
  const lastUsed = (voice: CatalogueVoice) =>
    usage.get(voice.key)?.lastUsed ?? "";
  const typed = query.trim().toLowerCase();

  if (!typed) {
    const used = catalogue
      .filter((voice) => uses(voice) > 0)
      .sort(
        (a, b) => uses(b) - uses(a) || lastUsed(b).localeCompare(lastUsed(a)),
      );

    return [...used, ...catalogue.filter((voice) => uses(voice) === 0)].slice(
      0,
      limit,
    );
  }

  return catalogue
    .map((voice) => ({ voice, score: matchScore(voice, typed) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        uses(b.voice) - uses(a.voice) ||
        a.voice.name.localeCompare(b.voice.name),
    )
    .slice(0, limit)
    .map(({ voice }) => voice);
};

/**
 * The picker entry for one voice.
 *
 * The label says where a voice came from and how much this server leans on
 * it, which is most of what there is to go on when choosing between a few
 * hundred names. The value is the bare name, so a choice and a typed name
 * resolve the same way.
 * @param voice The voice
 * @param usage This server's usage
 * @returns An autocomplete choice
 */
export const voiceChoice = (
  voice: CatalogueVoice,
  usage: VoiceUsage,
): { name: string; value: string } => {
  const uses = usage.get(voice.key)?.uses ?? 0;
  const details = [
    voice.kind === "preset" ? "preset" : undefined,
    uses ? `used ${uses}× here` : undefined,
  ].filter(Boolean);

  return {
    name: [voice.label, ...details].join(" · ").slice(0, 100),
    value: voice.name,
  };
};

/**
 * Reads one server's voice usage.
 * @param serverId The guild
 * @returns Usage keyed by voice
 */
export const getVoiceUsage = async (serverId: string): Promise<VoiceUsage> => {
  const records = await pb
    .collection<TtsVoiceUsageRecord>(USAGE_COLLECTION)
    .getFullList({
      filter: pb.filter("server_id = {:serverId}", { serverId }),
    });

  return new Map(
    records.map((record) => [
      record.voice,
      { uses: record.uses, lastUsed: record.last_used },
    ]),
  );
};

/**
 * Counts one use of a voice in a server.
 *
 * Never throws. A missed count makes the picker very slightly less accurate,
 * which is not worth failing a reply that has already been sent over.
 * @param serverId The guild
 * @param voice The voice that was used
 */
export const recordVoiceUse = async (
  serverId: string,
  voice: CatalogueVoice,
): Promise<void> => {
  const usage = pb.collection<TtsVoiceUsageRecord>(USAGE_COLLECTION);
  const now = new Date().toISOString();

  try {
    const [existing] = await usage.getFullList({
      filter: pb.filter("server_id = {:serverId} && voice = {:voice}", {
        serverId,
        voice: voice.key,
      }),
    });

    if (existing?.id) {
      await usage.update(existing.id, {
        uses: (existing.uses ?? 0) + 1,
        last_used: now,
      });
    } else {
      await usage.create({
        server_id: serverId,
        voice: voice.key,
        uses: 1,
        last_used: now,
      });
    }
  } catch (err) {
    console.error("Error recording TTS voice use:", { serverId, voice, err });
  }
};

/**
 * Fingerprints a normalised clip.
 *
 * Only meaningful on the output of `prepareSpeakerClip`: the same upload
 * normalised twice gives the same bytes, but the raw upload carries tags and
 * container details that differ between copies of the same audio.
 * @param path The normalised clip
 * @returns Hex sha256
 */
export const hashClip = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

/** Lower case, punctuation gone, whitespace collapsed - what whisper varies on. */
export const transcriptKey = (transcript: string): string =>
  transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

let presetTranscripts: Map<string, Voice> | undefined;

/** Preset transcripts by `transcriptKey`, read once. */
const presetsByTranscript = async (): Promise<Map<string, Voice>> => {
  if (presetTranscripts) return presetTranscripts;

  const entries = await Promise.all(
    availableVoices().map(async (voice) => {
      if (!voice.transcriptPath) return undefined;

      try {
        const key = transcriptKey(await readFile(voice.transcriptPath, "utf8"));
        return key ? ([key, voice] as const) : undefined;
      } catch {
        return undefined;
      }
    }),
  );

  presetTranscripts = new Map(
    entries.filter((entry): entry is readonly [string, Voice] => !!entry),
  );

  return presetTranscripts;
};

/**
 * Finds a voice that is already the clip being saved.
 *
 * Two checks. The hash catches the same file uploaded again. The transcript
 * catches the same clip from somewhere else - re-encoded, trimmed differently,
 * a different copy of the same meme - where every byte differs but whisper
 * still hears the same sentence. Presets are checked by transcript too, so
 * nobody re-saves GLaDOS under another name.
 *
 * The transcript check is exact after normalisation rather than fuzzy, and
 * skips short transcripts: it would rather miss a duplicate than refuse
 * somebody's own recording of a line that happens to be famous.
 * @param clip The normalised clip's hash and transcript
 * @returns The voice it duplicates, or undefined
 */
export const findDuplicateVoice = async ({
  clipHash,
  transcript,
}: {
  clipHash: string;
  transcript?: string;
}): Promise<CatalogueVoice | undefined> => {
  const saved = await listSavedVoices();

  const sameClip = saved.find((record) => record.clip_hash === clipHash);
  if (sameClip) return savedEntry(sameClip);

  const key = transcript ? transcriptKey(transcript) : "";
  if (key.length < MIN_TRANSCRIPT_MATCH_LENGTH) return undefined;

  const preset = (await presetsByTranscript()).get(key);
  if (preset) return presetEntry(preset);

  const sameWords = saved.find(
    (record) => record.transcript && transcriptKey(record.transcript) === key,
  );

  return sameWords ? savedEntry(sameWords) : undefined;
};

export type SaveVoiceResult =
  | { ok: true; voice: CatalogueVoice }
  | { ok: false; message: string; duplicate?: CatalogueVoice };

/**
 * Saves a clip as a voice anyone can use.
 *
 * Refuses a bad name, a name that is taken, and a clip that is already saved.
 * Those come back as a result rather than a throw because each is a normal
 * reply to the person saving, not an error.
 * @returns The new voice, or why it was not saved
 */
export const saveVoice = async ({
  name: rawName,
  clipPath,
  clipHash,
  transcript,
  userId,
  serverId,
}: {
  name: string;
  /** The normalised clip, from `prepareSpeakerClip`. */
  clipPath: string;
  clipHash: string;
  transcript?: string;
  userId: string;
  serverId: string;
}): Promise<SaveVoiceResult> => {
  const name = normaliseVoiceName(rawName);
  const problem = voiceNameProblem(name);
  if (problem) return { ok: false, message: problem };

  const taken = await findCatalogueVoice(name);
  if (taken) {
    return {
      ok: false,
      message: `There's already a voice called **${taken.label}**. Pick another name.`,
    };
  }

  const duplicate = await findDuplicateVoice({ clipHash, transcript });
  if (duplicate) {
    return {
      ok: false,
      message: `That's the same clip as **${duplicate.label}**, which is already saved - use \`voice: ${duplicate.name}\`.`,
      duplicate,
    };
  }

  const form = new FormData();
  form.append("name", name);
  form.append("transcript", transcript ?? "");
  form.append("clip_hash", clipHash);
  form.append("user_id", userId);
  form.append("server_id", serverId);
  form.append(
    "clip",
    new File([await readFile(clipPath)], "speaker.wav", { type: "audio/wav" }),
  );

  const record = await pb
    .collection<TtsVoiceRecord>(VOICES_COLLECTION)
    .create(form);

  resetSavedVoiceCache();

  return { ok: true, voice: savedEntry(record) };
};

export type DeleteVoiceResult = "deleted" | "missing" | "preset" | "not-yours";

/**
 * Deletes a saved voice, if it belongs to whoever is asking.
 *
 * Only the person who saved a voice can delete it. Voices are shared across
 * every server, so there is no one server's admin who is obviously entitled
 * to remove one.
 * @param name The voice name
 * @param userId Who is asking
 * @returns What happened
 */
export const deleteSavedVoice = async (
  name: string,
  userId: string,
): Promise<DeleteVoiceResult> => {
  const voice = await findCatalogueVoice(name);

  if (!voice) return "missing";
  if (voice.kind === "preset") return "preset";
  if (voice.record.user_id !== userId) return "not-yours";

  await pb.collection(VOICES_COLLECTION).delete(voice.key);
  resetSavedVoiceCache();

  return "deleted";
};

/**
 * Fetches a saved voice into a job workspace.
 *
 * Same reason presets are copied in: the sandboxed tools can only read the
 * workspace. The transcript lives in the record rather than in a file, so it
 * is written out here for `qwen-tts` to read.
 * @param record The saved voice
 * @param workDir The job's workspace
 * @param timeoutMs Cap on the download
 * @returns The staged clip and transcript paths
 */
export const stageSavedVoice = async (
  record: TtsVoiceRecord,
  workDir: string,
  timeoutMs: number,
): Promise<{ clipPath: string; transcriptPath?: string }> => {
  const clipPath = join(workDir, "reference.wav");

  await downloadToFile(
    pb.files.getURL(record, record.clip),
    clipPath,
    MAX_SAVED_CLIP_BYTES,
    timeoutMs,
  );

  if (!record.transcript?.trim()) return { clipPath };

  const transcriptPath = join(workDir, "reference.txt");
  await writeFile(transcriptPath, record.transcript.trim(), "utf8");

  return { clipPath, transcriptPath };
};
