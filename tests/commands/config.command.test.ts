import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { execute } from "../../commands/config.command";
import { DEFAULT_HORSEY_NAMES } from "../../modules/games/horsey/horseyNames";
import { pb } from "../../utilities/pocketbase";
import { typedOptionGetters } from "../mocks/typedOptionGetters";

/** What /config wrote to an existing config record, by stubbing Pocketbase for these tests only. */
const mockUpdate = mock(async (_id: string, _updates: object) => ({}));
const realCollection = pb.collection.bind(pb);

beforeEach(() => {
  mockUpdate.mockClear();
  pb.collection = mock(() => ({
    getFirstListItem: async () => ({
      id: "config1",
      server_id: "guild1",
      bot_channel: "",
    }),
    update: mockUpdate,
  })) as unknown as typeof pb.collection;
});

afterEach(() => {
  pb.collection = realCollection;
});

type Given = {
  bot_channel?: string;
  finicards_channel?: string;
  finicards_channel_reset?: boolean;
  horsey_names?: string;
};

const interactionWith = (given: Given, { admin = true } = {}) => ({
  options: {
    ...typedOptionGetters,
    get: (name: string) => {
      const value = given[name as keyof Given];
      if (value === undefined) return null;
      return name.endsWith("_channel") ? { channel: { id: value } } : { value };
    },
  },
  memberPermissions: { has: () => admin },
  guildId: "guild1",
  guild: { name: "Guild", channels: { cache: new Map() } },
  reply: mock(async (_reply: unknown) => undefined),
  deferReply: mock(async () => undefined),
  editReply: mock(async (_reply: unknown) => undefined),
});

const run = (interaction: ReturnType<typeof interactionWith>) =>
  execute(interaction as unknown as ChatInputCommandInteraction, () => {});

/** What /config saved. */
const saved = () => mockUpdate.mock.calls[0][1];
const answered = (interaction: ReturnType<typeof interactionWith>) =>
  interaction.editReply.mock.calls[0][0];

describe("/config", () => {
  it("is for server admins only", async () => {
    const interaction = interactionWith(
      { bot_channel: "c1" },
      { admin: false },
    );

    await run(interaction);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("says so when nothing was passed", async () => {
    const interaction = interactionWith({});

    await run(interaction);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(answered(interaction)).toBe(
      "Nothing to change - pass an option to update it.",
    );
  });

  it("writes only the options passed, so one setting can't clear another", async () => {
    const interaction = interactionWith({ horsey_names: "Ace, Bolt" });

    await run(interaction);

    expect(saved()).toEqual({ horsey_names: expect.any(String) });
  });

  it("sets the bot channel", async () => {
    const interaction = interactionWith({ bot_channel: "c1" });

    await run(interaction);

    expect(saved()).toEqual({ bot_channel: "c1" });
    expect(answered(interaction)).toBe("Bot channel set to <#c1>.");
  });

  it("sets a Finicards channel, and resets it to the bot channel", async () => {
    const set = interactionWith({ finicards_channel: "cards" });
    await run(set);
    expect(saved()).toEqual({ finicards_channel: "cards" });
    expect(answered(set)).toBe(
      "Finicards will post cards from the website in <#cards>.",
    );

    mockUpdate.mockClear();
    const reset = interactionWith({
      finicards_channel: "cards",
      finicards_channel_reset: true,
    });
    await run(reset);
    expect(saved()).toEqual({ finicards_channel: "" });
    expect(answered(reset)).toBe(
      "Finicards will post cards from the website in the bot channel.",
    );
  });

  it("resets horsey names to the defaults when given blank", async () => {
    const interaction = interactionWith({ horsey_names: "" });

    await run(interaction);

    expect(saved()).toEqual({ horsey_names: "" });
    expect(answered(interaction)).toBe(
      `Horsey names reset to the defaults: ${DEFAULT_HORSEY_NAMES.join(", ")}.`,
    );
  });
});
