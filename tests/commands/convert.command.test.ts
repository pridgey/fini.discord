import { describe, expect, it, mock } from "bun:test";
import {
  MAX_CONCURRENT_MEDIA_JOBS,
  tryAcquireMediaSlot,
} from "../../modules/media/mediaJobs";

const { data, execute } = await import("../../commands/convert.command");

/**
 * As with the /ytdlp tests, these cover the guards that run before the command
 * defers. The conversion itself is exercised against real files in
 * `tests/media`.
 */

type Options = Record<string, unknown>;

const attachment = (overrides: Record<string, unknown> = {}) => ({
  name: "clip.mp4",
  url: "https://cdn.discordapp.com/attachments/1/2/clip.mp4",
  size: 1024,
  contentType: "video/mp4",
  ...overrides,
});

const interactionWith = (options: Options) => ({
  options: {
    get: mock((name: string) => {
      if (!(name in options)) return undefined;
      // Attachment options come back on a different property than value ones.
      return name === "file"
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

describe("/convert command definition", () => {
  it("registers the file and format options as required", () => {
    const json = data.toJSON();
    const options = json.options ?? [];

    expect(json.name).toBe("convert");
    expect(options.map((option) => option.name)).toEqual([
      "file",
      "format",
      "chroma_key",
      "similarity",
      "blend",
      "start",
      "end",
    ]);
    expect(options[0].required).toBe(true);
    expect(options[1].required).toBe(true);
    // Everything past the format is optional.
    expect(options.slice(2).some((option) => option.required)).toBe(false);
  });

  it("keeps every description inside Discord's 100 character limit", () => {
    const json = data.toJSON();

    expect(json.description.length).toBeLessThanOrEqual(100);
    for (const option of json.options ?? []) {
      expect(option.description.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("/convert input validation", () => {
  it("asks for a file when none was attached", async () => {
    const interaction = interactionWith({ format: "mp4" });
    const logCommand = mock(() => {});

    await execute(interaction as never, logCommand);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(logCommand).toHaveBeenCalled();
  });

  it("refuses a format it does not know", async () => {
    const interaction = interactionWith({
      file: attachment(),
      format: "exe",
    });

    await execute(
      interaction as never,
      mock(() => {}),
    );

    expect(interaction.reply).toHaveBeenCalledWith("I don't know that format.");
  });

  it("says so when the colour is not a colour", async () => {
    const interaction = interactionWith({
      file: attachment(),
      format: "webm",
      chroma_key: "puce",
    });

    await execute(
      interaction as never,
      mock(() => {}),
    );

    expect(replyText(interaction)).toContain("puce");
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  // Keying into h264 is not a worse result, it is a wrong one - the keyed
  // pixels come out black and the user is left to work out why.
  it("refuses to key into a format with no alpha channel", async () => {
    const interaction = interactionWith({
      file: attachment(),
      format: "mp4",
      chroma_key: "green",
    });

    await execute(
      interaction as never,
      mock(() => {}),
    );

    const message = replyText(interaction);

    expect(message).toContain("webm");
    expect(message).toContain("gif");
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it("refuses an oversized attachment before downloading it", async () => {
    const interaction = interactionWith({
      file: attachment({ size: 900 * 1024 * 1024 }),
      format: "mp4",
    });

    await execute(
      interaction as never,
      mock(() => {}),
    );

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it("turns work away rather than queuing it when the slots are full", async () => {
    const held = fillMediaSlots();

    try {
      const interaction = interactionWith({
        file: attachment(),
        format: "mp4",
      });

      await execute(
        interaction as never,
        mock(() => {}),
      );

      expect(interaction.reply).toHaveBeenCalled();
      expect(interaction.deferReply).not.toHaveBeenCalled();
    } finally {
      held.forEach((release) => release?.());
    }
  });

  it("lets a key through on a format that can hold it", async () => {
    // The busy check is the last one the command makes, so reaching it means
    // the colour parsed and the alpha check passed.
    const held = fillMediaSlots();

    try {
      const interaction = interactionWith({
        file: attachment(),
        format: "webm",
        chroma_key: "#00ff00",
      });

      await execute(
        interaction as never,
        mock(() => {}),
      );

      expect(replyText(interaction)).not.toContain("transparency");
    } finally {
      held.forEach((release) => release?.());
    }
  });
});
