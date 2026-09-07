import { describe, expect, it, mock } from "bun:test";
import {
  MAX_CONCURRENT_MEDIA_JOBS,
  tryAcquireMediaSlot,
} from "../../modules/media/mediaJobs";

const { data, execute } = await import("../../commands/ytdlp.command");

/**
 * These cover the guards that run *before* the command defers, which is
 * everything that can be checked without spawning yt-dlp. The download itself
 * is exercised against real media in `tests/media`, where it does not need a
 * fake Discord interaction to get at it.
 */

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

/** Fills every media slot, and gives back the releases to hand back after. */
const fillMediaSlots = () =>
  Array.from({ length: MAX_CONCURRENT_MEDIA_JOBS }, () =>
    tryAcquireMediaSlot(),
  );

describe("/ytdlp command definition", () => {
  it("registers a required url and the optional knobs", () => {
    const json = data.toJSON();
    const options = json.options ?? [];

    expect(json.name).toBe("ytdlp");
    expect(options.map((option) => option.name)).toEqual([
      "url",
      "format",
      "quality",
      "start",
      "end",
    ]);
    expect(options[0].required).toBe(true);
    // Everything after the url is optional, so a bare link still works.
    expect(options.slice(1).some((option) => option.required)).toBe(false);
  });

  it("keeps every description inside Discord's 100 character limit", () => {
    const json = data.toJSON();

    expect(json.description.length).toBeLessThanOrEqual(100);
    for (const option of json.options ?? []) {
      expect(option.description.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("/ytdlp input validation", () => {
  it("refuses something that is not a link, without deferring", async () => {
    const interaction = interactionWith({ url: "send me that video" });
    const logCommand = mock(() => {});

    await execute(interaction as never, logCommand);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(logCommand).toHaveBeenCalled();
  });

  // yt-dlp reads local paths perfectly happily, and the bot's working
  // directory is where its .env lives.
  it("refuses a url pointing at the bot's own disk", async () => {
    const interaction = interactionWith({ url: "file:///etc/passwd" });

    await execute(
      interaction as never,
      mock(() => {}),
    );

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it("refuses a format it does not know", async () => {
    const interaction = interactionWith({
      url: "https://example.com/v",
      format: "exe",
    });

    await execute(
      interaction as never,
      mock(() => {}),
    );

    expect(interaction.reply).toHaveBeenCalledWith("I don't know that format.");
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  // Queuing would be worse than refusing: the interaction token dies after
  // fifteen minutes, so a queued job answers into the void.
  it("turns work away rather than queuing it when the slots are full", async () => {
    const held = fillMediaSlots();

    try {
      const interaction = interactionWith({ url: "https://example.com/v" });

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

  it("defaults to mp4, so a bare url gets past validation", async () => {
    // Slots are full, which is the last check the command makes - reaching it
    // means the url and the defaulted format both passed.
    const held = fillMediaSlots();

    try {
      const interaction = interactionWith({ url: "https://example.com/v" });

      await execute(
        interaction as never,
        mock(() => {}),
      );

      const [firstCall] = interaction.reply.mock.calls as unknown as string[][];

      expect(String(firstCall?.[0] ?? "")).not.toContain("format");
    } finally {
      held.forEach((release) => release?.());
    }
  });
});
