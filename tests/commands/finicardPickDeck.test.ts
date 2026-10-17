import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { pickDeck } from "../../commands/finicard/pickDeck";
import { pb } from "../../utilities/pocketbase";

const deck = (name: string) => ({ id: name.toLowerCase(), name, cards: [] });
let decks: ReturnType<typeof deck>[] = [];
const realCollection = pb.collection.bind(pb);

beforeEach(() => {
  pb.collection = mock(() => ({
    getFullList: async () => decks,
  })) as unknown as typeof pb.collection;
});

afterEach(() => {
  pb.collection = realCollection;
});

const interaction = () => ({
  user: { id: "user1" },
  editReply: mock(async (_reply: unknown) => undefined),
});
const pick = (asking: ReturnType<typeof interaction>, name: string | null) =>
  pickDeck(
    asking as unknown as ChatInputCommandInteraction,
    "guild1",
    name,
    "No decks!",
  );

describe("picking a deck for battle, practice or a dungeon", () => {
  it("says the given message when the player has no decks", async () => {
    decks = [];
    const asking = interaction();

    expect(await pick(asking, null)).toBeNull();
    expect(asking.editReply).toHaveBeenCalledWith("No decks!");
  });

  it("uses the only deck when none is named", async () => {
    decks = [deck("Main")];

    const picked = await pick(interaction(), null);

    expect(picked?.deck.name).toBe("Main");
  });

  it("finds a named deck, by the start of its name too", async () => {
    decks = [deck("Aggro"), deck("Main")];

    expect((await pick(interaction(), "main"))?.deck.name).toBe("Main");
    expect((await pick(interaction(), "agg"))?.deck.name).toBe("Aggro");
  });

  it("asks which deck when there are several and none is named", async () => {
    decks = [deck("Aggro"), deck("Main")];
    const asking = interaction();

    expect(await pick(asking, null)).toBeNull();
    expect(asking.editReply).toHaveBeenCalledWith(
      "You have several decks - say which one: **Aggro**, **Main**.",
    );
  });

  it("lists the player's decks when the named one doesn't exist", async () => {
    decks = [deck("Aggro"), deck("Main")];
    const asking = interaction();

    expect(await pick(asking, "Control")).toBeNull();
    expect(asking.editReply).toHaveBeenCalledWith(
      "You have no deck called **Control**. Yours: **Aggro**, **Main**.",
    );
  });
});
