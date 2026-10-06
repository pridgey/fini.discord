import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  MAX_CONCURRENT_MEDIA_JOBS,
  tryAcquireMediaSlot,
} from "../../modules/media/mediaJobs";
import { resetVoiceCache } from "../../modules/tts/voices";
import { resetSavedVoiceCache } from "../../modules/tts/savedVoices";

/**
 * As with the /convert tests, these cover the guards that run before the
 * command defers - generation itself loads 2.4GB of weights and is exercised
 * against the real binary by hand.
 *
 * The fixture is built at the top level rather than in `beforeAll`, which runs
 * too late: the preset list is scanned and cached on first use, and the import
 * below can be what triggers it.
 *
 * Pocketbase is stood in for by a list of saved voices and an empty usage
 * table - enough for lookups, autocomplete and deletes. Saving end to end is
 * covered in `tests/tts/savedVoices.test.ts`.
 */

type Row = Record<string, any>;

let savedVoices: Row[] = [];
let voiceUsage: Row[] = [];
const deleteVoice = mock(async (_id: string) => true);

mock.module("../../utilities/pocketbase", () => ({
  pb: {
    collection: (name: string) => ({
      getFullList: async () =>
        name === "tts_voices" ? [...savedVoices] : [...voiceUsage],
      create: async (row: Row) => row,
      update: async (_id: string, row: Row) => row,
      delete: deleteVoice,
    }),
    filter: (expr: string) => expr,
    files: { getURL: () => "http://pb/clip.wav" },
  },
}));

const voiceDir = await mkdtemp(join(tmpdir(), "fini-tts-voices-"));
const modelDir = await mkdtemp(join(tmpdir(), "fini-tts-models-"));

// A cut-down set rather than the shipped one, so the assertions below do not
// have to be rewritten every time a voice is added or dropped.
for (const name of ["narrator", "glados"]) {
  await writeFile(join(voiceDir, `${name}.mp3`), "");
}

// Enough for `isTtsConfigured` to pass, so the guards under test are the ones
// that actually run.
await writeFile(join(modelDir, "talker.gguf"), "");
await writeFile(join(modelDir, "codec.gguf"), "");

process.env.FINI_TTS_VOICE_DIR = voiceDir;
process.env.FINI_TTS_MODEL_DIR = modelDir;
delete process.env.FINI_QWEN_TTS_BIN;

// Another test file in the same process may already have scanned a library of
// its own, and the result is cached for the lifetime of the module.
resetVoiceCache();

afterAll(async () => {
  await rm(voiceDir, { recursive: true, force: true });
  await rm(modelDir, { recursive: true, force: true });
});

const { autocomplete, data, execute } =
  await import("../../commands/tts.command");

type Options = Record<string, unknown>;

const attachment = (overrides: Record<string, unknown> = {}) => ({
  name: "voice.mp3",
  url: "https://cdn.discordapp.com/attachments/1/2/voice.mp3",
  size: 1024,
  contentType: "audio/mpeg",
  ...overrides,
});

const interactionWith = (options: Options, subcommand = "say") => ({
  options: {
    getSubcommand: () => subcommand,
    get: mock((name: string) => {
      if (!(name in options)) return undefined;

      return name === "clip"
        ? { attachment: options[name] }
        : { value: options[name] };
    }),
  },
  guild: { premiumTier: 0 },
  guildId: "server-1",
  user: { id: "user-1", username: "tester" },
  reply: mock(() => Promise.resolve()),
  deferReply: mock(() => Promise.resolve()),
  editReply: mock(() => Promise.resolve()),
});

const fillMediaSlots = () =>
  Array.from({ length: MAX_CONCURRENT_MEDIA_JOBS }, () =>
    tryAcquireMediaSlot(),
  );

/** The reply text from a command that bailed before deferring. */
const replyText = (interaction: ReturnType<typeof interactionWith>): string => {
  const [firstCall] = interaction.reply.mock.calls as unknown as string[][];

  return String(firstCall?.[0] ?? "");
};

const run = async (options: Options, subcommand = "say") => {
  const interaction = interactionWith(options, subcommand);
  const logCommand = mock(() => {});

  await execute(interaction as never, logCommand);

  return { interaction, logCommand };
};

beforeEach(() => {
  savedVoices = [
    {
      id: "rec1",
      name: "Big Bob",
      clip: "speaker.wav",
      transcript: "Hi, I'm Big Bob.",
      clip_hash: "hash1",
      user_id: "user-1",
      server_id: "server-1",
    },
    {
      id: "rec2",
      name: "Someone Else's",
      clip: "speaker.wav",
      transcript: "",
      clip_hash: "hash2",
      user_id: "user-2",
      server_id: "server-2",
    },
  ];
  voiceUsage = [];
  deleteVoice.mockClear();
  resetSavedVoiceCache();
});

describe("/tts command definition", () => {
  const subcommand = (name: string) =>
    data
      .toJSON()
      .options?.find((option) => option.name === name) as unknown as {
      options: { name: string; required?: boolean; autocomplete?: boolean }[];
    };

  it("has say, save, voices and delete", () => {
    expect(data.toJSON().options?.map((option) => option.name)).toEqual([
      "say",
      "save",
      "voices",
      "delete",
    ]);
  });

  it("puts every subcommand's required options before its optional ones", () => {
    // Discord rejects a command whose required options come last.
    for (const name of ["say", "save", "voices", "delete"]) {
      const required = subcommand(name).options.map((option) =>
        Boolean(option.required),
      );

      expect(required.join()).toBe(
        [...required].sort((a, b) => Number(b) - Number(a)).join(),
      );
    }
  });

  it("searches voices with autocomplete rather than a fixed list", () => {
    // A fixed list caps at 25, and there can be any number of saved voices.
    const voice = subcommand("say").options.find((o) => o.name === "voice");

    expect(voice?.autocomplete).toBe(true);
    expect(voice?.required).toBeFalsy();
  });

  it("says with text, a clip to imitate, and a language", () => {
    const names = subcommand("say").options.map((option) => option.name);

    expect(names).toEqual(["text", "voice", "clip", "language"]);
  });

  it("saves from a name and a clip", () => {
    const required = subcommand("save")
      .options.filter((option) => option.required)
      .map((option) => option.name);

    expect(required).toEqual(["name", "clip"]);
  });
});

describe("/tts voice autocomplete", () => {
  const complete = async (
    focused: string,
    subcommand = "say",
    userId = "user-1",
  ) => {
    const respond = mock(async (_choices: unknown) => {});

    await autocomplete({
      options: {
        getFocused: () => focused,
        getSubcommand: () => subcommand,
      },
      guildId: "server-1",
      user: { id: userId },
      respond,
    } as never);

    return (respond.mock.calls[0]?.[0] ?? []) as {
      name: string;
      value: string;
    }[];
  };

  it("puts this server's most used voices first", async () => {
    voiceUsage = [
      {
        server_id: "server-1",
        voice: "rec1",
        uses: 7,
        last_used: "2026-10-04",
      },
    ];

    const choices = await complete("");

    expect(choices[0]).toEqual({
      name: "Big Bob · used 7× here",
      value: "Big Bob",
    });
    expect(choices.map((choice) => choice.value)).toEqual([
      "Big Bob",
      "narrator",
      "glados",
      "Someone Else's",
    ]);
  });

  it("searches every voice once something is typed", async () => {
    const choices = await complete("else");

    expect(choices.map((choice) => choice.value)).toEqual(["Someone Else's"]);
  });

  it("only offers your own voices to delete", async () => {
    const choices = await complete("", "delete", "user-2");

    expect(choices.map((choice) => choice.value)).toEqual(["Someone Else's"]);
  });
});

describe("/tts delete", () => {
  it("deletes a voice you saved", async () => {
    const { interaction } = await run({ voice: "big bob" }, "delete");

    expect(deleteVoice).toHaveBeenCalledWith("rec1");
    expect(JSON.stringify(interaction.reply.mock.calls[0])).toContain(
      "Deleted",
    );
  });

  it("refuses to delete someone else's voice", async () => {
    const { interaction } = await run({ voice: "Someone Else's" }, "delete");

    expect(deleteVoice).not.toHaveBeenCalled();
    expect(JSON.stringify(interaction.reply.mock.calls[0])).toContain(
      "only delete voices you saved",
    );
  });
});

describe("/tts voices", () => {
  it("lists matching voices with who saved them", async () => {
    const { interaction } = await run({ search: "bob" }, "voices");
    const [reply] = interaction.reply.mock.calls[0] as unknown as [
      { content: string },
    ];

    expect(reply.content).toContain("**Big Bob** · by <@user-1>");
    expect(reply.content).not.toContain("Someone Else");
  });
});

describe("/tts save guards", () => {
  it("refuses a bad name without deferring", async () => {
    const { interaction, logCommand } = await run(
      { name: "<@everyone>", clip: attachment() },
      "save",
    );

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(replyText(interaction)).toContain("letters");
    expect(logCommand).toHaveBeenCalled();
  });

  it("refuses a name that is taken, by a preset or a saved voice", async () => {
    for (const name of ["GLaDOS", "big bob"]) {
      const { interaction } = await run({ name, clip: attachment() }, "save");

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(replyText(interaction)).toContain("already a voice");
    }
  });

  it("refuses an oversized clip", async () => {
    const { interaction } = await run(
      { name: "New Voice", clip: attachment({ size: 200 * 1024 * 1024 }) },
      "save",
    );

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(replyText(interaction)).toContain("cap at");
  });
});

describe("/tts guards", () => {
  it("refuses an empty prompt without deferring", async () => {
    const { interaction, logCommand } = await run({ text: "   " });

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(replyText(interaction)).toContain("something to say");
    expect(logCommand).toHaveBeenCalled();
  });

  it("refuses a voice it does not have", async () => {
    // A stale client can still send a choice the library no longer holds, and
    // falling through would quietly use the default voice instead.
    const { interaction } = await run({ text: "hello", voice: "goku" });

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(replyText(interaction)).toContain("goku");
    expect(replyText(interaction)).toContain("/tts voices");
  });

  it("refuses a saved voice and a clip together", async () => {
    // Found case-insensitively, as a name typed without picking from the list
    // would be.
    const { interaction } = await run({
      text: "hello",
      voice: "BIG BOB",
      clip: attachment(),
    });

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(replyText(interaction)).toContain("Pick one");
  });

  it("refuses a preset voice and a clip together", async () => {
    const { interaction } = await run({
      text: "hello",
      voice: "narrator",
      clip: attachment(),
    });

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(replyText(interaction)).toContain("Pick one");
  });

  it("refuses an oversized clip", async () => {
    const { interaction } = await run({
      text: "hello",
      clip: attachment({ size: 200 * 1024 * 1024 }),
    });

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(replyText(interaction)).toContain("cap at");
  });

  it("refuses to queue when both job slots are taken", async () => {
    const held = fillMediaSlots();

    try {
      const { interaction } = await run({ text: "hello" });

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(replyText(interaction)).toContain("Give me a minute");
    } finally {
      held.forEach((release) => release?.());
    }
  });

  it("releases the slot it took once the job is over", async () => {
    // A leaked slot is invisible until the second one goes too and the command
    // stops answering entirely.
    await run({ text: "hello" });

    const held = fillMediaSlots();

    try {
      expect(held.every(Boolean)).toBe(true);
    } finally {
      held.forEach((release) => release?.());
    }
  });
});
