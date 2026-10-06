import { randomBytes } from "crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Clips waiting on someone to press "Save voice".
 *
 * `/tts say` with an uploaded clip offers to save it, but the job workspace is
 * deleted as soon as the reply is sent, and the press - and the name typed
 * into the modal after it - can come much later. So the normalised clip and
 * its transcript are copied out to here and kept for a day, keyed by an id
 * that goes in the button's custom id.
 *
 * Disk rather than Pocketbase, because almost none of these are ever saved:
 * writing every uploaded clip to the database and deleting most of them a day
 * later would be churn for nothing.
 */

/** How long an unsaved clip is kept. */
export const PENDING_VOICE_TTL_MS = 24 * 60 * 60 * 1000;

const CLIP_NAME = "speaker.wav";
const META_NAME = "meta.json";

/** Ids are hex, so one from a custom id can never walk out of the directory. */
const ID_PATTERN = /^[a-f0-9]{16}$/;

export const pendingVoiceDir = (): string =>
  process.env.FINI_TTS_PENDING_DIR || join(tmpdir(), "fini-tts-pending");

export type PendingVoice = {
  clipPath: string;
  clipHash: string;
  transcript?: string;
  createdAt: number;
};

/**
 * Deletes clips past their day.
 *
 * Run on every stash rather than on a timer, which is often enough - nothing
 * accumulates unless clips are being uploaded.
 */
const sweepExpired = async (): Promise<void> => {
  const dir = pendingVoiceDir();
  const entries = await readdir(dir).catch(() => [] as string[]);

  await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry);

      try {
        if (Date.now() - (await stat(path)).mtimeMs > PENDING_VOICE_TTL_MS) {
          await rm(path, { recursive: true, force: true });
        }
      } catch {
        // Another sweep got there first.
      }
    }),
  );
};

/**
 * Keeps a normalised clip around so it can be saved later.
 * @returns The id to put in the save button
 */
export const stashPendingVoice = async ({
  clipPath,
  clipHash,
  transcript,
}: {
  clipPath: string;
  clipHash: string;
  transcript?: string;
}): Promise<string> => {
  await sweepExpired();

  const id = randomBytes(8).toString("hex");
  const dir = join(pendingVoiceDir(), id);

  await mkdir(dir, { recursive: true });
  await copyFile(clipPath, join(dir, CLIP_NAME));
  await writeFile(
    join(dir, META_NAME),
    JSON.stringify({ clipHash, transcript, createdAt: Date.now() }),
    "utf8",
  );

  return id;
};

/**
 * Reads back a stashed clip.
 * @param id The id from the button
 * @returns The clip, or undefined when it is unknown or has expired
 */
export const readPendingVoice = async (
  id: string | undefined,
): Promise<PendingVoice | undefined> => {
  if (!id || !ID_PATTERN.test(id)) return undefined;

  const dir = join(pendingVoiceDir(), id);

  try {
    const meta = JSON.parse(await readFile(join(dir, META_NAME), "utf8"));

    if (Date.now() - meta.createdAt > PENDING_VOICE_TTL_MS) return undefined;

    return {
      clipPath: join(dir, CLIP_NAME),
      clipHash: meta.clipHash,
      transcript: meta.transcript || undefined,
      createdAt: meta.createdAt,
    };
  } catch {
    return undefined;
  }
};

/**
 * Forgets a stashed clip, once it has been saved.
 * @param id The id from the button
 */
export const discardPendingVoice = async (id: string): Promise<void> => {
  if (!ID_PATTERN.test(id)) return;

  await rm(join(pendingVoiceDir(), id), { recursive: true, force: true });
};
