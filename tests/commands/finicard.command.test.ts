import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

/**
 * /finicard is a dispatcher: it defers, builds the context and hands the
 * interaction to a subcommand's handler. The handlers are replaced here (only
 * this command imports them) so each route can be checked on its own.
 */
const handlers = {
  showCollection: mock(async () => undefined),
  showCard: mock(async () => undefined),
  showRecord: mock(async () => undefined),
  startBattle: mock(async () => undefined),
  startPractice: mock(async () => undefined),
  showPending: mock(async () => undefined),
  enterDungeon: mock(async () => undefined),
  showDungeonTutorial: mock(async () => undefined),
  grantCards: mock(async () => undefined),
  openPackFor: mock(async () => undefined),
  handleDeckSubcommand: mock(async () => undefined),
};
mock.module("../../commands/finicard/collection", () => ({
  showCollection: handlers.showCollection,
  showCard: handlers.showCard,
  showRecord: handlers.showRecord,
}));
mock.module("../../commands/finicard/battle", () => ({
  startBattle: handlers.startBattle,
  startPractice: handlers.startPractice,
  showPending: handlers.showPending,
}));
mock.module("../../commands/finicard/dungeon", () => ({
  enterDungeon: handlers.enterDungeon,
  showDungeonTutorial: handlers.showDungeonTutorial,
}));
mock.module("../../commands/finicard/grant", () => ({
  grantCards: handlers.grantCards,
}));
mock.module("../../commands/finicard/pack", () => ({
  openPackFor: handlers.openPackFor,
}));
mock.module("../../commands/finicard/deck", () => ({
  handleDeckSubcommand: handlers.handleDeckSubcommand,
}));

const { execute } = await import("../../commands/finicard.command");

const interactionFor = (subcommand: string, group: string | null = null) => ({
  options: {
    getSubcommand: () => subcommand,
    getSubcommandGroup: () => group,
    getInteger: () => null,
    getString: () => null,
  },
  user: { id: "user1", username: "aya" },
  guildId: "guild1",
  guild: { name: "Guild" },
  deferred: true,
  replied: false,
  deferReply: mock(async (_options?: unknown) => undefined),
  editReply: mock(async (_reply: unknown) => undefined),
  reply: mock(async (_reply: unknown) => undefined),
});

const run = (interaction: ReturnType<typeof interactionFor>) =>
  execute(interaction as unknown as ChatInputCommandInteraction, () => {});

const CONTEXT = {
  serverId: "guild1",
  serverName: "Guild",
  identifier: "aya-Guild",
};

beforeEach(() => {
  for (const handler of Object.values(handlers)) handler.mockClear();
});

describe("/finicard", () => {
  it.each([
    ["collection", "showCollection"],
    ["card", "showCard"],
    ["record", "showRecord"],
    ["battle", "startBattle"],
    ["practice", "startPractice"],
    ["pending", "showPending"],
    ["dungeon", "enterDungeon"],
    ["dungeon-tutorial", "showDungeonTutorial"],
    ["grant", "grantCards"],
  ] as const)(
    "sends %s to %s with the server's context",
    async (subcommand, handler) => {
      const interaction = interactionFor(subcommand);

      await run(interaction);

      expect(handlers[handler]).toHaveBeenCalledWith(interaction, CONTEXT);
    },
  );

  it("opens a pack with its set and test options", async () => {
    const interaction = interactionFor("pack");

    await run(interaction);

    expect(handlers.openPackFor).toHaveBeenCalledWith(interaction, {
      set: null,
      test: null,
    });
  });

  it("sends the deck group to the deck handler, whatever its subcommand", async () => {
    const interaction = interactionFor("list", "deck");

    await run(interaction);

    expect(handlers.handleDeckSubcommand).toHaveBeenCalledWith(
      interaction,
      CONTEXT,
    );
  });

  it("answers privately only for practice, the tutorial and the abilities guide", async () => {
    for (const subcommand of ["practice", "dungeon-tutorial", "abilities"]) {
      const interaction = interactionFor(subcommand);
      await run(interaction);
      expect(interaction.deferReply).toHaveBeenCalledWith({
        flags: [MessageFlags.Ephemeral],
      });
    }
    const battle = interactionFor("battle");
    await run(battle);
    expect(battle.deferReply).toHaveBeenCalledWith(undefined);
  });

  it("tells the player when a subcommand fails", async () => {
    spyOn(console, "error").mockImplementation(() => {});
    handlers.startBattle.mockImplementationOnce(async () => {
      throw new Error("broken");
    });
    const interaction = interactionFor("battle");

    await run(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      "Something went wrong running that Finicards command.",
    );
  });
});
