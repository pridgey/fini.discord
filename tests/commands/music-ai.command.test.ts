import { afterAll, describe, expect, it, mock } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  MAX_CONCURRENT_MEDIA_JOBS,
  tryAcquireMediaSlot,
} from "../../modules/media/mediaJobs";
import {
  DEFAULT_MUSIC_SECONDS,
  MAX_MUSIC_SECONDS,
  musicGenModelFiles,
} from "../../modules/music-ai/musicGen";

/**
 * As with the /tts and /convert tests, these cover the guards that run before
 * the command defers - generation itself loads 630MB of weights and is
 * exercised against the real script by hand.
 *
 * The fixture is built at the top level rather than in `beforeAll`, which runs
 * too late: the option list is baked into the builder when the command module
 * is evaluated, and that happens during the import below.
 */

const modelDir = await mkdtemp(join(tmpdir(), "fini-musicgen-"));
const scriptPath = join(modelDir, "musicgen.ts");

process.env.FINI_MUSICGEN_MODEL_DIR = modelDir;
process.env.FINI_MUSICGEN_SCRIPT = scriptPath;

// Enough for `isMusicGenConfigured` to pass, so the guards under test are the
// ones that actually run rather than the setup check in front of them.
await writeFile(scriptPath, "");
await mkdir(join(modelDir, "onnx"), { recursive: true });
for (const file of musicGenModelFiles()) await writeFile(file, "");

afterAll(async () => {
  await rm(modelDir, { recursive: true, force: true });
});

const { data, execute } = await import("../../commands/music-ai.command");

type Options = Record<string, unknown>;

const interactionWith = (options: Options) => ({
  options: {
    get: mock((name: string) =>
      name in options ? { value: options[name] } : undefined,
    ),
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

describe("/music-ai command definition", () => {
  const json = () => data.toJSON();

  it("requires the prompt option", () => {
    const prompt = json().options?.find((option) => option.name === "prompt");

    expect(prompt?.required).toBe(true);
  });

  it("puts the required option before the optional ones", () => {
    // Discord rejects a command whose required options come last.
    const required = json().options?.map((option) => Boolean(option.required));

    expect(required?.indexOf(true)).toBe(0);
    expect(required?.lastIndexOf(true)).toBe(0);
  });

  it("offers style and tempo as independent options", () => {
    const names = json().options?.map((option) => option.name);

    expect(names).toContain("style");
    expect(names).toContain("tempo");
  });

  it("bounds the length option at the generator's cap", () => {
    // Discord rejecting an out-of-range value is cheaper than the command
    // silently clamping one, and the two have to agree on the number.
    const length = json().options?.find(
      (option) => option.name === "length",
    ) as { min_value?: number; max_value?: number } | undefined;

    expect(length?.max_value).toBe(MAX_MUSIC_SECONDS);
    expect(length?.min_value).toBeGreaterThan(0);
    expect(length?.min_value).toBeLessThanOrEqual(DEFAULT_MUSIC_SECONDS);
  });
});

describe("/music-ai guards", () => {
  it("refuses an empty prompt without deferring", async () => {
    const { interaction, logCommand } = await run({ prompt: "   " });

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(replyText(interaction)).toContain("tell me what to write");
    expect(logCommand).toHaveBeenCalled();
  });

  it("says so up front when the model is not installed", async () => {
    // Checked before the slot and the defer, so an unconfigured host answers
    // immediately instead of showing a spinner and then failing.
    const saved = process.env.FINI_MUSICGEN_MODEL_DIR;
    process.env.FINI_MUSICGEN_MODEL_DIR = "/nonexistent";

    try {
      const { interaction } = await run({ prompt: "a jaunty tune" });

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(replyText(interaction)).toContain("setup-music.sh");
    } finally {
      process.env.FINI_MUSICGEN_MODEL_DIR = saved;
    }
  });

  it("refuses to queue when both job slots are taken", async () => {
    const held = fillMediaSlots();

    try {
      const { interaction } = await run({ prompt: "a jaunty tune" });

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(replyText(interaction)).toContain("Give me a minute");
    } finally {
      held.forEach((release) => release?.());
    }
  });

  it("releases the slot it took once the job is over", async () => {
    // A leaked slot is invisible until the second one goes too and the
    // command stops answering entirely. The generation below fails - the
    // model files are empty - which is exactly the path that leaks.
    await run({ prompt: "a jaunty tune" });

    const held = fillMediaSlots();

    try {
      expect(held.every(Boolean)).toBe(true);
    } finally {
      held.forEach((release) => release?.());
    }
  });

  it("accepts style and tempo together", async () => {
    // The old command rejected both at once. They are not exclusive: it got
    // the rule from /tts, where a preset voice and an uploaded clip are.
    const { interaction } = await run({
      prompt: "a chase scene",
      style: "orchestral",
      tempo: "fast",
    });

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.deferReply).toHaveBeenCalled();
  });
});
