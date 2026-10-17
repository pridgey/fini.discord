import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { typedOptionGetters } from "../mocks/typedOptionGetters";

const mockRewardWager = mock(
  async (_won: boolean, _multiplier: number) => undefined,
);
let balance = 100;
mock.module("../../modules/finicoin", () => ({
  runGame: async (_user: string, _guild: string, bet: number) => ({
    userHasFunds: balance >= bet,
    userBalance: balance,
    rewardWager: mockRewardWager,
  }),
}));
const mockGrabGif = mock(async () => "https://example.org/result.gif");
mock.module("../../utilities/gif", () => ({ grabGif: mockGrabGif }));
// 4 is even, so "Even" wins.
mock.module("../../utilities/randomNumber", () => ({ randomNumber: () => 4 }));

const { execute } = await import("../../commands/evenodd.command");

const interactionWith = (bet: number, option: "Even" | "Odd") => ({
  options: {
    ...typedOptionGetters,
    get: (name: string) => ({ value: name === "bet" ? bet : option }),
  },
  user: { id: "user1", username: "Aya" },
  guildId: "guild1",
  guild: { name: "Guild" },
  reply: mock(async (_reply: unknown) => undefined),
  deferReply: mock(async () => undefined),
  editReply: mock(async (_reply: unknown) => undefined),
});

const run = (interaction: ReturnType<typeof interactionWith>) =>
  execute(interaction as unknown as ChatInputCommandInteraction, () => {});

beforeEach(() => {
  balance = 100;
  mockRewardWager.mockClear();
  mockRewardWager.mockImplementation(async () => undefined);
  mockGrabGif.mockClear();
});

describe("/evenodd", () => {
  it("turns away a bet the player can't cover, taking nothing", async () => {
    balance = 5;
    const interaction = interactionWith(10, "Even");

    await run(interaction);

    expect(String(interaction.reply.mock.calls[0][0])).toContain(
      "You do not have enough Finicoin",
    );
    expect(mockRewardWager).not.toHaveBeenCalled();
  });

  it("defers before searching for a GIF, then settles a win", async () => {
    const interaction = interactionWith(10, "Even");

    await run(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(mockRewardWager).toHaveBeenCalledWith(true, 1);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
  });

  it("says no finicoin moved when settling the bet fails", async () => {
    mockRewardWager.mockImplementation(async () => {
      throw new Error("pocketbase down");
    });
    const interaction = interactionWith(10, "Odd");

    await run(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      "Something went wrong before your bet was settled, so no finicoin changed hands.",
    );
  });

  it("says the bet stands when only showing the result fails", async () => {
    const interaction = interactionWith(10, "Odd");
    interaction.editReply.mockImplementationOnce(async () => {
      throw new Error("Discord hiccup");
    });

    await run(interaction);

    expect(mockRewardWager).toHaveBeenCalledWith(false, 1);
    expect(interaction.editReply).toHaveBeenLastCalledWith(
      "Something went wrong showing the result, but your bet is settled: it was Even, so you lost 10 finicoin.",
    );
  });
});
