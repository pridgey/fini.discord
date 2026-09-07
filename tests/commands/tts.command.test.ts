import { afterAll, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  MAX_CONCURRENT_MEDIA_JOBS,
  tryAcquireMediaSlot,
} from "../../modules/media/mediaJobs";
import { resetVoiceCache } from "../../modules/tts/voices";

/**
 * As with the /convert tests, these cover the guards that run before the
 * command defers - generation itself loads 2.3GB of weights and is exercised
 * against the real binary by hand.
 *
 * The fixture is built at the top level rather than in `beforeAll`, which runs
 * too late: the `voice` option's choices are baked into the builder when the
 * command module is evaluated, and that happens during the import below.
 */

const voiceDir = await mkdtemp(join(tmpdir(), "fini-tts-voices-"));
const modelDir = await mkdtemp(join(tmpdir(), "fini-tts-models-"));

// A cut-down set rather than the shipped one, so the assertions below do not
// have to be rewritten every time a voice is added or dropped.
for (const name of ["narrator", "glados"]) {
  await writeFile(join(voiceDir, `${name}.mp3`), "");
}

// Enough for `isTtsConfigured` to pass, so the guards under test are the ones
// that actually run.
await writeFile(join(modelDir, "model.gguf"), "");
await writeFile(join(modelDir, "mmproj.gguf"), "");

process.env.FINI_TTS_VOICE_DIR = voiceDir;
process.env.FINI_TTS_MODEL_DIR = modelDir;
delete process.env.FINI_LLAMA_TTS_BIN;

// Another test file in the same process may already have scanned a library of
// its own, and the result is cached for the lifetime of the module.
resetVoiceCache();

afterAll(async () => {
  await rm(voiceDir, { recursive: true, force: true });
  await rm(modelDir, { recursive: true, force: true });
});

const { data, execute } = await import("../../commands/tts.command");

type Options = Record<string, unknown>;

const attachment = (overrides: Record<string, unknown> = {}) => ({
  name: "voice.mp3",
  url: "https://cdn.discordapp.com/attachments/1/2/voice.mp3",
  size: 1024,
  contentType: "audio/mpeg",
  ...overrides,
});

const interactionWith = (options: Options) => ({
  options: {
    get: mock((name: string) => {
      if (!(name in options)) return undefined;

      return name === "clip"
        ? { attachment: options[name] }
        : { value: options[name] };
    }),
  },
  guild: { premiumTier: 0 },
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

const run = async (options: Options) => {
  const interaction = interactionWith(options);
  const logCommand = mock(() => {});

  await execute(interaction as never, logCommand);

  return { interaction, logCommand };
};

describe("/tts command definition", () => {
  const json = () => data.toJSON();

  it("requires the text option", () => {
    const text = json().options?.find((option) => option.name === "text");

    expect(text?.required).toBe(true);
  });

  it("offers the installed voices as choices", () => {
    const voice = json().options?.find((option) => option.name === "voice");

    expect(voice).toBeDefined();
    expect(voice?.required).toBeFalsy();
    expect(
      (voice as { choices?: { value: string }[] }).choices?.map(
        (choice) => choice.value,
      ),
    ).toEqual(["narrator", "glados"]);
  });

  it("puts the required option before the optional ones", () => {
    // Discord rejects a command whose required options come last.
    const required = json().options?.map((option) => Boolean(option.required));

    expect(required?.indexOf(true)).toBe(0);
    expect(required?.lastIndexOf(true)).toBe(0);
  });

  it("takes a clip to imitate and a language", () => {
    const names = json().options?.map((option) => option.name);

    expect(names).toContain("clip");
    expect(names).toContain("language");
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
    expect(replyText(interaction)).toContain("narrator");
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
