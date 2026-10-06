import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { mockConsole, restoreConsole } from "../mocks/console.mock";

/**
 * Saved voices against an in-memory stand-in for Pocketbase.
 *
 * The stand-in understands just enough of the SDK for this module: full-list
 * reads, filters built with `pb.filter` (matched field by field, camelCase
 * params against snake_case fields), creates from a FormData or an object,
 * updates and deletes.
 */

type Row = Record<string, any>;

const tables: Record<string, Row[]> = {};
let nextId = 1;

const snake = (key: string) =>
  key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const collection = (name: string) => {
  const rows = () => (tables[name] ??= []);

  return {
    getFullList: mock(async (options: { filter?: string } = {}) => {
      if (!options.filter) return [...rows()];

      const params = JSON.parse(options.filter) as Row;
      return rows().filter((row) =>
        Object.entries(params).every(
          ([key, value]) => row[snake(key)] === value,
        ),
      );
    }),
    create: mock(async (data: FormData | Row) => {
      const row: Row = {
        id: `rec${nextId++}`,
        created: new Date().toISOString(),
      };

      if (data instanceof FormData) {
        data.forEach((value, key) => {
          row[key] = value instanceof File ? value.name : value;
        });
      } else {
        Object.assign(row, data);
      }

      rows().unshift(row);
      return row;
    }),
    update: mock(async (id: string, data: Row) => {
      const row = rows().find((r) => r.id === id)!;
      Object.assign(row, data);
      return row;
    }),
    delete: mock(async (id: string) => {
      tables[name] = rows().filter((r) => r.id !== id);
      return true;
    }),
  };
};

const collections: Record<string, ReturnType<typeof collection>> = {};

mock.module("../../utilities/pocketbase", () => ({
  pb: {
    collection: (name: string) => (collections[name] ??= collection(name)),
    filter: (_expr: string, params: Row) => JSON.stringify(params),
    files: {
      getURL: (record: Row, file: string) => `http://pb/${record.id}/${file}`,
    },
  },
}));

const GLADOS_LINE = "Oh, it's you. It's been a long time. How have you been?";

const voiceDir = await mkdtemp(join(tmpdir(), "fini-saved-voices-"));
for (const name of ["narrator", "glados"]) {
  await writeFile(join(voiceDir, `${name}.mp3`), "");
}
await writeFile(join(voiceDir, "glados.txt"), GLADOS_LINE);

process.env.FINI_TTS_VOICE_DIR = voiceDir;

const { resetVoiceCache } = await import("../../modules/tts/voices");
resetVoiceCache();

const {
  deleteSavedVoice,
  findCatalogueVoice,
  findDuplicateVoice,
  getVoiceUsage,
  rankVoices,
  recordVoiceUse,
  resetSavedVoiceCache,
  saveVoice,
  transcriptKey,
  voiceCatalogue,
  voiceChoice,
  voiceNameProblem,
} = await import("../../modules/tts/savedVoices");

const clipPath = join(voiceDir, "speaker.wav");
await writeFile(clipPath, "RIFF fake wav");

afterAll(async () => {
  await rm(voiceDir, { recursive: true, force: true });
});

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  resetSavedVoiceCache();
});

const seedVoice = (row: Row) => {
  (tables.tts_voices ??= []).push({
    id: `rec${nextId++}`,
    transcript: "",
    clip: "speaker.wav",
    clip_hash: `hash-${nextId}`,
    user_id: "owner",
    server_id: "server-1",
    ...row,
  });
};

const save = (overrides: Partial<Parameters<typeof saveVoice>[0]> = {}) =>
  saveVoice({
    name: "Big Bob",
    clipPath,
    clipHash: "abc123",
    transcript: "Hello there, this is a perfectly normal sentence.",
    userId: "saver",
    serverId: "server-1",
    ...overrides,
  });

describe("voice names", () => {
  it("accepts ordinary names", () => {
    expect(voiceNameProblem("Big Bob")).toBeUndefined();
    expect(voiceNameProblem("Mr. O'Neil-2")).toBeUndefined();
    expect(voiceNameProblem("Zoë")).toBeUndefined();
  });

  it("refuses empty, long and marked-up names", () => {
    expect(voiceNameProblem("")).toContain("needs a name");
    expect(voiceNameProblem("x".repeat(33))).toContain("32");
    expect(voiceNameProblem("<@123>")).toContain("letters");
    expect(voiceNameProblem("**bold**")).toContain("letters");
  });
});

describe("findCatalogueVoice", () => {
  it("finds presets by name or label, in any case", async () => {
    expect((await findCatalogueVoice("glados"))?.kind).toBe("preset");
    expect((await findCatalogueVoice("GLaDOS"))?.name).toBe("glados");
  });

  it("finds saved voices case-insensitively", async () => {
    seedVoice({ name: "Big Bob" });

    const found = await findCatalogueVoice("  big   bob ");

    expect(found?.kind).toBe("saved");
    expect(found?.name).toBe("Big Bob");
  });

  it("re-reads the saved list once before giving up", async () => {
    // Warm the cache, then add a voice behind its back - as an admin editing
    // Pocketbase directly would.
    await findCatalogueVoice("narrator");
    seedVoice({ name: "Late Arrival" });

    expect((await findCatalogueVoice("late arrival"))?.name).toBe(
      "Late Arrival",
    );
  });

  it("returns undefined for an unknown voice", async () => {
    expect(await findCatalogueVoice("nobody")).toBeUndefined();
  });
});

describe("rankVoices", () => {
  const catalogue = async () => {
    seedVoice({ name: "Gojo Fan" });
    seedVoice({ name: "Big Goon" });
    seedVoice({ name: "Ego" });
    seedVoice({ name: "Big Bob" });
    return voiceCatalogue();
  };

  const usageFor = (
    voices: Awaited<ReturnType<typeof catalogue>>,
    uses: Record<string, [number, string]>,
  ) =>
    new Map(
      voices
        .filter((voice) => voice.name in uses)
        .map((voice) => [
          voice.key,
          { uses: uses[voice.name][0], lastUsed: uses[voice.name][1] },
        ]),
    );

  it("leads with the most used voices when nothing is typed", async () => {
    const voices = await catalogue();
    const usage = usageFor(voices, {
      "Big Bob": [9, "2026-10-01"],
      Ego: [3, "2026-10-02"],
      glados: [3, "2026-10-04"],
    });

    expect(rankVoices(voices, usage, "").map((v) => v.name)).toEqual([
      "Big Bob",
      // Tied on uses, so the more recently used one goes first.
      "glados",
      "Ego",
      // Then everything unused, presets first.
      "narrator",
      "Gojo Fan",
      "Big Goon",
    ]);
  });

  it("caps the list", async () => {
    const voices = await catalogue();

    expect(rankVoices(voices, new Map(), "", 3)).toHaveLength(3);
  });

  it("searches everything, best match first, when something is typed", async () => {
    const voices = await catalogue();
    const usage = usageFor(voices, { Ego: [50, "2026-10-04"] });

    // A prefix beats a later word's prefix beats a match mid-word, however
    // much the weaker match is used.
    expect(rankVoices(voices, usage, "go").map((v) => v.name)).toEqual([
      "Gojo Fan",
      "Big Goon",
      "Ego",
    ]);
  });

  it("breaks ties between equal matches by usage", async () => {
    seedVoice({ name: "Bob One" });
    seedVoice({ name: "Bob Two" });
    const voices = await voiceCatalogue();
    const usage = usageFor(voices, { "Bob Two": [2, "2026-10-04"] });

    expect(rankVoices(voices, usage, "bob").map((v) => v.name)).toEqual([
      "Bob Two",
      "Bob One",
    ]);
  });

  it("matches preset labels", async () => {
    const voices = await catalogue();

    expect(rankVoices(voices, new Map(), "GLaD").map((v) => v.name)).toEqual([
      "glados",
    ]);
  });
});

describe("voiceChoice", () => {
  it("labels presets and usage, and uses the bare name as the value", async () => {
    seedVoice({ name: "Big Bob" });
    const catalogue = await voiceCatalogue();
    const glados = catalogue.find((v) => v.name === "glados")!;
    const bob = catalogue.find((v) => v.name === "Big Bob")!;
    const usage = new Map([[bob.key, { uses: 4, lastUsed: "" }]]);

    expect(voiceChoice(glados, usage)).toEqual({
      name: "GLaDOS · preset",
      value: "glados",
    });
    expect(voiceChoice(bob, usage)).toEqual({
      name: "Big Bob · used 4× here",
      value: "Big Bob",
    });
  });
});

describe("usage", () => {
  it("counts uses per server", async () => {
    mockConsole();
    const glados = (await findCatalogueVoice("glados"))!;

    await recordVoiceUse("server-1", glados);
    await recordVoiceUse("server-1", glados);
    await recordVoiceUse("server-2", glados);

    expect((await getVoiceUsage("server-1")).get("preset:glados")?.uses).toBe(
      2,
    );
    expect((await getVoiceUsage("server-2")).get("preset:glados")?.uses).toBe(
      1,
    );
    restoreConsole();
  });
});

describe("findDuplicateVoice", () => {
  it("matches the same clip by hash", async () => {
    seedVoice({ name: "Big Bob", clip_hash: "same" });

    expect((await findDuplicateVoice({ clipHash: "same" }))?.name).toBe(
      "Big Bob",
    );
  });

  it("matches the same words despite punctuation and case", async () => {
    seedVoice({
      name: "Big Bob",
      transcript: "Well, hello there! This is Big Bob speaking.",
    });

    const duplicate = await findDuplicateVoice({
      clipHash: "different",
      transcript: "well hello there this is big bob speaking",
    });

    expect(duplicate?.name).toBe("Big Bob");
  });

  it("matches a preset by its transcript", async () => {
    const duplicate = await findDuplicateVoice({
      clipHash: "different",
      transcript: GLADOS_LINE.toUpperCase(),
    });

    expect(duplicate?.kind).toBe("preset");
    expect(duplicate?.name).toBe("glados");
  });

  it("does not trust short transcripts", async () => {
    seedVoice({ name: "Yeah Guy", transcript: "Yeah." });

    expect(
      await findDuplicateVoice({ clipHash: "different", transcript: "yeah" }),
    ).toBeUndefined();
  });

  it("normalises transcripts the way whisper varies", () => {
    expect(transcriptKey("  Hello,   WORLD!! ")).toBe("hello world");
  });
});

describe("saveVoice", () => {
  it("saves a new voice and finds it straight away", async () => {
    const result = await save();

    expect(result.ok).toBe(true);
    expect(tables.tts_voices[0]).toMatchObject({
      name: "Big Bob",
      clip_hash: "abc123",
      user_id: "saver",
      clip: "speaker.wav",
    });
    expect((await findCatalogueVoice("big bob"))?.kind).toBe("saved");
  });

  it("refuses a taken name, preset or saved", async () => {
    seedVoice({ name: "Big Bob" });

    const saved = await save({ name: "BIG BOB", clipHash: "new" });
    const preset = await save({ name: "GLaDOS", clipHash: "new" });

    expect(saved.ok).toBe(false);
    expect(preset.ok).toBe(false);
    expect(!saved.ok && saved.message).toContain("already a voice");
    expect(tables.tts_voices).toHaveLength(1);
  });

  it("refuses a clip that is already saved, and says under what", async () => {
    seedVoice({ name: "Big Bob", clip_hash: "abc123" });

    const result = await save({ name: "Bob Again" });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.duplicate?.name).toBe("Big Bob");
    expect(!result.ok && result.message).toContain("Big Bob");
  });

  it("refuses a bad name before touching anything", async () => {
    const result = await save({ name: "<@everyone>" });

    expect(result.ok).toBe(false);
    expect(tables.tts_voices ?? []).toHaveLength(0);
  });
});

describe("deleteSavedVoice", () => {
  it("lets the owner delete their voice", async () => {
    seedVoice({ name: "Big Bob", user_id: "owner" });

    expect(await deleteSavedVoice("big bob", "owner")).toBe("deleted");
    expect(await findCatalogueVoice("big bob")).toBeUndefined();
  });

  it("refuses everyone else, presets, and unknown voices", async () => {
    seedVoice({ name: "Big Bob", user_id: "owner" });

    expect(await deleteSavedVoice("Big Bob", "someone-else")).toBe("not-yours");
    expect(await deleteSavedVoice("glados", "owner")).toBe("preset");
    expect(await deleteSavedVoice("nobody", "owner")).toBe("missing");
    expect(tables.tts_voices).toHaveLength(1);
  });
});
