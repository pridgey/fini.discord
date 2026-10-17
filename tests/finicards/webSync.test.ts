import { describe, expect, test } from "bun:test";
import type {
  V2CardDefinitionRecord,
  V2DeckRecord,
  V2UserCardRecord,
} from "../../types/PocketbaseTablesV2";
import { DECK_SIZE, MAX_DECKS_PER_USER } from "../../modules/finicards/decks";
import {
  decideCardShow,
  decideDeckRequest,
} from "../../modules/finicards/webSync/requests";
import {
  artKeyOf,
  buildSnapshot,
  faceKeyOf,
  fingerprint,
  META_ID,
  planSync,
  playerRowId,
  toWebCard,
  toWebDefinition,
} from "../../modules/finicards/webSync/snapshot";

const definition = (
  id: string,
  patch: Partial<V2CardDefinitionRecord> = {},
): V2CardDefinitionRecord => ({
  id,
  card_name: `Card ${id}`,
  series: "Series",
  rarity: "common",
  power: 7,
  wit: 4,
  heart: 4,
  card_type: "power",
  tags: [],
  keyword: "",
  cost: 2,
  set_piece: "",
  art_url: "",
  legacy_card: "",
  population: 0,
  active: true,
  ...patch,
});

const copy = (
  id: string,
  card: string,
  patch: Partial<V2UserCardRecord> = {},
): V2UserCardRecord => ({
  id,
  user_id: "u1",
  server_id: "s1",
  identifier: "one",
  card,
  foil: false,
  acquired_from: "pack",
  ...patch,
});

const deck = (
  id: string,
  name: string,
  cards: string[] = [],
): V2DeckRecord => ({
  id,
  user_id: "u1",
  server_id: "s1",
  identifier: "one",
  name,
  cards,
});

const ids = (count: number, prefix = "c"): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`);

describe("web snapshot", () => {
  const local = {
    definitions: [
      definition("d1"),
      definition("d2"),
      definition("secret", { secret_art: true }),
    ],
    cards: [
      copy("c1", "d1"),
      copy("c2", "d1", { user_id: "u2", identifier: "two" }),
      copy("c3", "d1", { server_id: "s2" }),
      copy("orphan", "gone"),
    ],
    decks: [deck("k1", "Mine", ["c1"])],
    serverNames: { s1: "Server One" },
    meta: { limits: {} },
  };
  const snapshot = buildSnapshot(local);

  test("only cards somebody owns leave Fini", () => {
    expect([...snapshot.web_definition.keys()]).toEqual(["d1"]);
  });

  test("a copy whose card is gone is left out", () => {
    expect([...snapshot.web_card.keys()].sort()).toEqual(["c1", "c2", "c3"]);
  });

  test("a player gets one row per server, with a count", () => {
    expect(snapshot.web_player.size).toBe(3);
    const row = snapshot.web_player.get(playerRowId("u1", "s1"));
    expect(row).toMatchObject({
      owner: "u1",
      server_id: "s1",
      server_name: "Server One",
      cards: 1,
    });
    expect(snapshot.web_player.get(playerRowId("u1", "s2"))?.server_name).toBe(
      "",
    );
  });

  test("player row ids are valid Pocketbase ids and stable", () => {
    expect(playerRowId("u1", "s1")).toMatch(/^[a-z0-9]{15}$/);
    expect(playerRowId("u1", "s1")).toBe(playerRowId("u1", "s1"));
    expect(playerRowId("u1", "s1")).not.toBe(playerRowId("u1", "s2"));
    expect(META_ID).toMatch(/^[a-z0-9]{15}$/);
  });

  test("a Legendary is copy 1 whatever its stored serial", () => {
    expect(
      toWebCard(copy("x", "d1", { legendary: "cosmos", serial: 4 })).serial,
    ).toBe(1);
    expect(toWebCard(copy("x", "d1", { serial: 4 })).serial).toBe(4);
  });

  test("a card's crop focus is sent, with a default above centre", () => {
    expect(toWebDefinition(definition("d"))).toMatchObject({
      focus_x: 0.5,
      focus_y: 0.3,
    });
    expect(
      toWebDefinition(
        definition("d", { art_adjust: { focus: { x: 0.2, y: 0.8 } } }),
      ),
    ).toMatchObject({ focus_x: 0.2, focus_y: 0.8 });
  });
});

describe("web sync plan", () => {
  const row = (id: string, name: string) => ({
    id,
    owner: "u1",
    server_id: "s1",
    name,
    cards: ["a"],
  });
  const held = (rows: ReturnType<typeof row>[]) =>
    new Map(rows.map((entry) => [entry.id, fingerprint("web_deck", entry)]));

  test("nothing is sent when the mailbox already matches", () => {
    const rows = [row("a", "A"), row("b", "B")];
    const plan = planSync(
      "web_deck",
      new Map(rows.map((entry) => [entry.id, entry])),
      held(rows),
    );
    expect(plan).toEqual({ create: [], update: [], remove: [] });
  });

  test("new, changed and gone rows are told apart", () => {
    const wanted = new Map(
      [row("a", "A"), row("b", "Renamed"), row("c", "C")].map((entry) => [
        entry.id,
        entry,
      ]),
    );
    const plan = planSync(
      "web_deck",
      wanted,
      held([row("a", "A"), row("b", "B"), row("z", "Z")]),
    );
    expect(plan.create.map((entry) => entry.id)).toEqual(["c"]);
    expect(plan.update.map((entry) => entry.id)).toEqual(["b"]);
    expect(plan.remove).toEqual(["z"]);
  });

  test("a fingerprint ignores key order and fields Fini does not own", () => {
    const a = fingerprint("web_meta", { data: { x: 1, y: { p: 1, q: 2 } } });
    const b = fingerprint("web_meta", {
      data: { y: { q: 2, p: 1 }, x: 1 },
      updated: "later",
    });
    expect(a).toBe(b);
  });

  test("artwork is sent again when its source or trim changes, not its focus", () => {
    const base = definition("d", { art: "one.png" });
    expect(artKeyOf(definition("d"))).toBe("");
    expect(artKeyOf(base)).not.toBe(artKeyOf({ ...base, art: "two.png" }));
    expect(artKeyOf(base)).not.toBe(
      artKeyOf({
        ...base,
        art_adjust: { trim: { left: 0.1, top: 0, right: 0, bottom: 0 } },
      }),
    );
    expect(artKeyOf(base)).toBe(
      artKeyOf({ ...base, art_adjust: { focus: { x: 0.1, y: 0.1 } } }),
    );
  });
});

describe("card faces", () => {
  const base = definition("d", { art: "one.png" });
  const key = faceKeyOf(copy("c", "d"), base);

  test("a face is kept while nothing printed on it changes", () => {
    expect(faceKeyOf(copy("c", "d"), { ...base })).toBe(key);
    // Not printed: whether packs still hold the card, or what it costs.
    expect(faceKeyOf(copy("c", "d"), { ...base, active: false, cost: 9 })).toBe(
      key,
    );
    expect(faceKeyOf(copy("c", "d", { identifier: "renamed" }), base)).toBe(
      key,
    );
  });

  test("a face is made again when the copy or its card changes", () => {
    const changed = [
      faceKeyOf(copy("c", "d", { foil: true }), base),
      faceKeyOf(copy("c", "d", { keyword: "vanguard" }), base),
      faceKeyOf(copy("c", "d", { legendary: "cosmos" }), base),
      faceKeyOf(copy("c", "d", { serial: 2 }), base),
      faceKeyOf(copy("other", "d"), base),
      faceKeyOf(copy("c", "d"), { ...base, card_name: "Renamed" }),
      faceKeyOf(copy("c", "d"), { ...base, power: 6, wit: 5 }),
      faceKeyOf(copy("c", "d"), { ...base, art: "two.png" }),
      faceKeyOf(copy("c", "d"), {
        ...base,
        art_adjust: { focus: { x: 0.1, y: 0.1 } },
      }),
      faceKeyOf(copy("c", "d"), { ...base, number: 12, set_size: 240, set: 3 }),
    ];
    for (const other of changed) expect(other).not.toBe(key);
    expect(new Set(changed).size).toBe(changed.length);
  });
});

describe("deck requests from the site", () => {
  const owned = new Set(ids(60));
  const decks = [deck("k1", "First", ids(20)), deck("k2", "Second", ids(20))];
  const save = (payload: unknown, existing = decks) =>
    decideDeckRequest("deck_save", payload, owned, existing);

  test("a new deck is made", () => {
    expect(save({ name: "  Third ", cards: ids(DECK_SIZE) })).toEqual({
      ok: true,
      action: "create",
      name: "Third",
      cards: ids(DECK_SIZE),
    });
  });

  test("an existing deck is changed, and may be renamed", () => {
    expect(
      save({ deckId: "k1", name: "Renamed", cards: ids(20) }),
    ).toMatchObject({
      ok: true,
      action: "update",
      deckId: "k1",
      name: "Renamed",
    });
    // Keeping its own name is not a clash with itself.
    expect(save({ deckId: "k1", name: "first", cards: ids(20) }).ok).toBe(true);
  });

  test("duplicate cards are counted once", () => {
    const result = save({ name: "Dupes", cards: [...ids(19), "c0", "c1"] });
    expect(result).toMatchObject({ ok: false });
    expect(save({ name: "Dupes", cards: [...ids(20), "c0"] })).toMatchObject({
      ok: true,
      cards: ids(20),
    });
  });

  test("cards the player does not hold are refused", () => {
    const result = save({ name: "Theft", cards: [...ids(19), "not-mine"] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain(
      "no longer in your collection",
    );
  });

  test("a deck is exactly one size", () => {
    expect(save({ name: "Small", cards: ids(DECK_SIZE - 1) }).ok).toBe(false);
    expect(save({ name: "Big", cards: ids(DECK_SIZE + 1) }).ok).toBe(false);
    expect(save({ name: "Exact", cards: ids(DECK_SIZE) }).ok).toBe(true);
  });

  test("names are checked, and may not match another deck", () => {
    expect(save({ name: "   ", cards: ids(20) }).ok).toBe(false);
    expect(save({ name: "x".repeat(33), cards: ids(20) }).ok).toBe(false);
    expect(save({ name: "SECOND", cards: ids(20) }).ok).toBe(false);
    expect(save({ deckId: "k1", name: "second", cards: ids(20) }).ok).toBe(
      false,
    );
  });

  test("the deck limit holds for new decks only", () => {
    const full = Array.from({ length: MAX_DECKS_PER_USER }, (_, index) =>
      deck(`k${index}`, `Deck ${index}`),
    );
    expect(save({ name: "One more", cards: ids(20) }, full).ok).toBe(false);
    expect(
      save({ deckId: "k0", name: "Deck 0", cards: ids(20) }, full).ok,
    ).toBe(true);
  });

  test("a deck that is not the player's cannot be changed or deleted", () => {
    expect(
      save({ deckId: "someone-elses", name: "Mine now", cards: ids(20) }).ok,
    ).toBe(false);
    expect(
      decideDeckRequest(
        "deck_delete",
        { deckId: "someone-elses" },
        owned,
        decks,
      ).ok,
    ).toBe(false);
    expect(decideDeckRequest("deck_delete", {}, owned, decks).ok).toBe(false);
    expect(
      decideDeckRequest("deck_delete", { deckId: "k2" }, owned, decks),
    ).toEqual({
      ok: true,
      action: "delete",
      deckId: "k2",
      name: "Second",
    });
  });

  test("malformed requests are refused, not thrown on", () => {
    for (const payload of [
      null,
      "text",
      [],
      {},
      { name: 5, cards: ids(20) },
      { name: "Ok", cards: "c0" },
      { name: "Ok", cards: [1, 2, 3] },
      { name: "Ok", cards: ids(1000) },
      { deckId: 7, name: "Ok", cards: ids(20) },
    ]) {
      expect(save(payload).ok).toBe(false);
    }
    expect(
      decideDeckRequest(
        "grant_card",
        { name: "Ok", cards: ids(20) },
        owned,
        decks,
      ).ok,
    ).toBe(false);
  });
});

describe("showing a card in Discord from the site", () => {
  const owned = new Set(["mine1", "mine2"]);

  test("goes ahead for a card the player holds", () => {
    expect(decideCardShow({ card: "mine1" }, owned)).toEqual({
      ok: true,
      cardId: "mine1",
    });
  });

  test("refuses someone else's card, or a request it can't read", () => {
    expect(decideCardShow({ card: "theirs" }, owned)).toEqual({
      ok: false,
      reason: "That card is no longer in your collection.",
    });
    for (const payload of [
      null,
      "mine1",
      ["mine1"],
      {},
      { card: 7 },
      { card: "" },
    ]) {
      expect(decideCardShow(payload, owned).ok).toBe(false);
    }
  });
});
