import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  CURATED_VOICES,
  MAX_VOICE_CHOICES,
  availableVoices,
  findVoice,
  findVoiceSample,
  resetVoiceCache,
  voiceChoices,
  voiceLibraryDir,
} from "../../modules/tts/voices";

/**
 * Two things are worth checking here. That a voice missing from disk is left
 * out of the picker rather than offered and then failing at generation time,
 * and that the shipped set in `clips/` actually resolves - a renamed or
 * forgotten file would otherwise only show up as a voice quietly absent from
 * the dropdown.
 */

let dir: string;
let savedDir: string | undefined;

/** Drops a flat clip in, the way the shipped set is arranged. */
const installFlat = async (name: string, extension = ".mp3") => {
  await writeFile(join(dir, `${name}${extension}`), "");
};

/** Drops a nested clip in, the way the old Coqui library was arranged. */
const installNested = async (name: string, ...files: string[]) => {
  await mkdir(join(dir, name), { recursive: true });

  for (const file of files) {
    await writeFile(join(dir, name, file), "");
  }
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fini-voices-"));
  savedDir = process.env.FINI_TTS_VOICE_DIR;
  process.env.FINI_TTS_VOICE_DIR = dir;
  resetVoiceCache();
});

afterEach(async () => {
  if (savedDir === undefined) delete process.env.FINI_TTS_VOICE_DIR;
  else process.env.FINI_TTS_VOICE_DIR = savedDir;

  resetVoiceCache();
  await rm(dir, { recursive: true, force: true });
});

describe("the shipped clips", () => {
  it("has one for every curated voice", () => {
    // The clips live next to the code in modules/tts/clips, so a fresh
    // checkout has working voices with no configuration.
    delete process.env.FINI_TTS_VOICE_DIR;
    resetVoiceCache();

    expect(availableVoices().map((voice) => voice.name)).toEqual(
      CURATED_VOICES.map((voice) => voice.name),
    );
  });

  it("resolves relative to the module, not the working directory", () => {
    delete process.env.FINI_TTS_VOICE_DIR;

    // The bot is started from several places; `clips/` sits next to the code
    // regardless.
    expect(voiceLibraryDir()).toContain("modules/tts/clips");
  });

  it("stays inside Discord's cap on choices", () => {
    expect(CURATED_VOICES.length).toBeLessThanOrEqual(MAX_VOICE_CHOICES);
  });

  it("leads with the voices that just read text", () => {
    // Someone who wants the audio rather than the joke should not have to
    // scroll past the memes to find it.
    expect(CURATED_VOICES.slice(0, 2).map((voice) => voice.name)).toEqual([
      "narrator",
      "announcer",
    ]);
  });

  it("has no duplicate names", () => {
    const names = CURATED_VOICES.map((voice) => voice.name);

    expect(new Set(names).size).toBe(names.length);
  });
});

describe("voiceLibraryDir", () => {
  it("prefers the configured directory", () => {
    expect(voiceLibraryDir()).toBe(dir);
  });
});

describe("findVoiceSample", () => {
  it("finds a flat clip", async () => {
    await installFlat("narrator");

    expect(findVoiceSample("narrator", dir)).toBe(join(dir, "narrator.mp3"));
  });

  it("finds a flat clip whatever container it is in", async () => {
    await installFlat("glados", ".flac");

    expect(findVoiceSample("glados", dir)).toBe(join(dir, "glados.flac"));
  });

  it("falls back to the old nested layout", async () => {
    // So FINI_TTS_VOICE_DIR can point at a Coqui-era library without it being
    // reorganised first.
    await installNested("gojo", "1.wav");

    expect(findVoiceSample("gojo", dir)).toBe(join(dir, "gojo", "1.wav"));
  });

  it("prefers a flat clip over a nested directory of the same name", async () => {
    await installNested("goku", "1.wav");
    await installFlat("goku");

    expect(findVoiceSample("goku", dir)).toBe(join(dir, "goku.mp3"));
  });

  it("picks the same nested clip every time when there are several", async () => {
    await installNested("sonic", "4.wav", "2.wav", "1.wav", "3.wav");

    expect(findVoiceSample("sonic", dir)).toBe(join(dir, "sonic", "1.wav"));
  });

  it("ignores files that are not audio", async () => {
    await writeFile(join(dir, "miku.txt"), "");
    await installNested("egirl", "notes.txt", "cover.png");

    expect(findVoiceSample("miku", dir)).toBeUndefined();
    expect(findVoiceSample("egirl", dir)).toBeUndefined();
  });

  it("returns nothing for a voice that is not installed", () => {
    expect(findVoiceSample("nobody", dir)).toBeUndefined();
  });

  it("returns nothing for an empty nested directory", async () => {
    await installNested("empty");

    expect(findVoiceSample("empty", dir)).toBeUndefined();
  });
});

describe("availableVoices", () => {
  it("offers only the voices that are on disk", async () => {
    await installFlat("narrator");
    await installFlat("goku");

    expect(availableVoices().map((voice) => voice.name)).toEqual([
      "narrator",
      "goku",
    ]);
  });

  it("keeps the curated order rather than directory order", async () => {
    // Installed back to front; the list should still read in curated order.
    for (const name of ["egirl", "gojo", "narrator"]) {
      await installFlat(name);
    }

    expect(availableVoices().map((voice) => voice.name)).toEqual([
      "narrator",
      "gojo",
      "egirl",
    ]);
  });

  it("ignores files that are not curated voices", async () => {
    await installFlat("train_atkins");
    await installFlat("cond_latent_example");
    await installFlat("narrator");

    expect(availableVoices().map((voice) => voice.name)).toEqual(["narrator"]);
  });

  it("is empty with no clips at all", () => {
    expect(availableVoices()).toEqual([]);
  });

  it("title-cases a name with no override", async () => {
    await installFlat("announcer");

    expect(availableVoices()[0]?.label).toBe("Announcer");
  });

  it("uses the override where title-casing gets it wrong", async () => {
    await installFlat("glados");
    await installFlat("egirl");

    expect(availableVoices().map((voice) => voice.label)).toEqual([
      "GLaDOS",
      "E-girl",
    ]);
  });
});

describe("findVoice", () => {
  beforeEach(async () => {
    await installFlat("gojo");
    resetVoiceCache();
  });

  it("resolves an installed voice to its clip", () => {
    expect(findVoice("gojo")?.samplePath).toBe(join(dir, "gojo.mp3"));
  });

  it("returns nothing for a voice that is not installed", () => {
    // A stale client can still send a choice the library no longer has, and
    // the command has to be able to tell.
    expect(findVoice("narrator")).toBeUndefined();
  });

  it("returns nothing when no voice was chosen", () => {
    expect(findVoice(undefined)).toBeUndefined();
  });
});

describe("voiceChoices", () => {
  it("pairs the label with the option value", async () => {
    await installFlat("glados");
    resetVoiceCache();

    expect(voiceChoices()).toEqual([{ name: "GLaDOS", value: "glados" }]);
  });
});
