import { existsSync, readdirSync, statSync } from "fs";
import { extname, join } from "path";

/**
 * The preset voice list for `/tts`.
 *
 * Qwen3-TTS clones whatever voice it is shown, so a "voice" here is just a few
 * seconds of reference audio - there is no per-voice model to train or ship.
 * Adding a voice is adding an mp3 and a line to `CURATED_VOICES`.
 *
 * The clips ship in the repo, in `clips/`. That is affordable because a
 * reference is a few seconds of speech rather than the minutes-long samples the
 * old Coqui-backed command needed - eight voices come to about 2.4MB - and it
 * means a fresh checkout has working voices with no configuration at all.
 * `FINI_TTS_VOICE_DIR` overrides the directory for a host that wants its own
 * set.
 *
 * A curated voice that is not on disk is left out of the choice list rather
 * than offered and then failing: a slash command choice that always errors is
 * worse than one that is missing, because only one of those is discoverable
 * before you use it.
 */

/**
 * Where the reference clips live.
 *
 * Resolved relative to this module rather than to the working directory,
 * because the bot is started from a couple of different places (`npm start`,
 * `bun run index.ts`, the test runner) and `clips/` sits next to the code
 * regardless.
 * @returns Absolute path to the clip directory
 */
export const voiceLibraryDir = (): string =>
  process.env.FINI_TTS_VOICE_DIR || join(import.meta.dir, "clips");

export type CuratedVoice = {
  /** Slash-command option value, and the clip's filename without extension. */
  name: string;
  /**
   * Override for the picker label.
   *
   * Only needed where title-casing the name gets it wrong - "Glados" for
   * GLaDOS, "Egirl" for E-girl. Most voices need nothing here.
   */
  label?: string;
};

/**
 * Voices offered in the option picker, in the order they appear.
 *
 * Ordered utility first: the two that read text straight come before the
 * character voices, because someone who wants the audio rather than the joke
 * should not have to scroll past six memes to find it. GLaDOS leads the
 * character voices as the most broadly useful of them - a flat, dry read is
 * funny against almost any input, where the shouty ones are only funny against
 * some.
 *
 * Curated rather than "every file in the directory" so that ordering is a
 * decision rather than whatever `readdir` returns, and because Discord caps a
 * string option at 25 choices.
 */
export const CURATED_VOICES: CuratedVoice[] = [
  { name: "narrator" },
  { name: "announcer" },
  { name: "glados", label: "GLaDOS" },
  { name: "gojo" },
  { name: "goku" },
  { name: "sonic" },
  { name: "miku" },
  { name: "egirl", label: "E-girl" },
];

/** Discord's ceiling on choices for a single string option. */
export const MAX_VOICE_CHOICES = 25;

/**
 * Audio extensions a reference clip may have.
 *
 * The shipped set is mp3, but everything here is normalised through ffmpeg
 * before the model sees it, so the container only has to be something ffmpeg
 * reads - which matters for a host pointing `FINI_TTS_VOICE_DIR` at its own
 * collection.
 */
const CLIP_EXTENSIONS = [".wav", ".mp3", ".flac", ".ogg", ".m4a"];

export type Voice = {
  /** Slash-command option value. */
  name: string;
  /** What the user sees in the picker. */
  label: string;
  /** Absolute path to the reference clip to clone from. */
  samplePath: string;
};

/** `joey_wheeler` reads as a filename; `Joey Wheeler` reads as a voice. */
const toLabel = (name: string): string =>
  name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/** The alphabetically first playable file in a directory, if there is one. */
const firstClipIn = (dir: string): string | undefined => {
  const clip = readdirSync(dir)
    .filter((file) => CLIP_EXTENSIONS.includes(extname(file).toLowerCase()))
    .sort()
    .at(0);

  return clip ? join(dir, clip) : undefined;
};

/**
 * Finds the clip to clone for one voice.
 *
 * Two layouts, tried in that order. Flat - `narrator.mp3` - is what the shipped
 * set uses and what anyone dropping in a new voice will produce. Nested -
 * `narrator/something.wav` - is how the old Coqui sample library was arranged,
 * and is still accepted so `FINI_TTS_VOICE_DIR` can point at one of those
 * without reorganising it.
 *
 * In the nested case the alphabetically first playable file wins, rather than
 * whatever `readdir` returns, so a voice sounds the same from one restart to
 * the next.
 * @param name The voice to look for
 * @param libraryDir The directory to look in, defaulting to the configured one
 * @returns The clip path, or undefined when the voice is not installed
 */
export const findVoiceSample = (
  name: string,
  libraryDir = voiceLibraryDir(),
): string | undefined => {
  try {
    for (const extension of CLIP_EXTENSIONS) {
      const flat = join(libraryDir, `${name}${extension}`);
      if (existsSync(flat)) return flat;
    }

    const nested = join(libraryDir, name);
    if (existsSync(nested) && statSync(nested).isDirectory()) {
      return firstClipIn(nested);
    }

    return undefined;
  } catch (err) {
    // An unreadable directory is a broken install, not a reason to take the
    // whole command down - the voice just does not get offered.
    console.error("Error reading TTS voice directory:", { libraryDir, err });
    return undefined;
  }
};

let cached: Voice[] | undefined;

/**
 * The voices that are actually installed.
 *
 * Scanned once and cached, because this is read while the slash command is
 * being built - both at registration and on every import of the command - and
 * the directory does not change while the bot is running.
 * @returns The available voices, at most `MAX_VOICE_CHOICES` of them
 */
export const availableVoices = (): Voice[] => {
  if (cached) return cached;

  const libraryDir = voiceLibraryDir();

  cached = CURATED_VOICES.flatMap(({ name, label }) => {
    const samplePath = findVoiceSample(name, libraryDir);

    return samplePath
      ? [{ name, label: label ?? toLabel(name), samplePath }]
      : [];
  }).slice(0, MAX_VOICE_CHOICES);

  if (!cached.length) {
    console.warn(
      `No TTS voices found in ${libraryDir} - /tts will only offer the model's default voice.`,
    );
  }

  return cached;
};

/** Drops the cache, so a test can point the library somewhere else. */
export const resetVoiceCache = (): void => {
  cached = undefined;
};

/**
 * Looks up a voice by its option value.
 * @param value The value sent with the interaction
 * @returns The voice, or undefined when it is not one of ours
 */
export const findVoice = (value: string | undefined): Voice | undefined =>
  value ? availableVoices().find((voice) => voice.name === value) : undefined;

/**
 * Builds the choice list for the `voice` option.
 * @returns Discord option choices in curated order
 */
export const voiceChoices = (): { name: string; value: string }[] =>
  availableVoices().map((voice) => ({ name: voice.label, value: voice.name }));

/** The installed voice names, for error messages. */
export const voiceList = (): string =>
  availableVoices()
    .map((voice) => voice.name)
    .join(", ");
