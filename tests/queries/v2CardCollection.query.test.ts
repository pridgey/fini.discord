import { beforeEach, describe, expect, it, mock } from "bun:test";

const card = (overrides: Record<string, unknown> = {}) => ({
  id: "defabc",
  card_name: "Test Card",
  series: "Test Series",
  rarity: "uncommon",
  power: 7,
  wit: 5,
  heart: 3,
  card_type: "power",
  tags: [],
  keyword: "",
  cost: 3,
  set_piece: "",
  art_url: "",
  legacy_card: "",
  population: 0,
  active: true,
  ...overrides,
});

const owned = (id: string, definition = card()) => ({
  id,
  user_id: "user1",
  server_id: "guild1",
  identifier: "pridgey-gekin",
  card: definition.id,
  foil: false,
  acquired_from: "pack",
  expand: { card: definition },
});

const mockGetList = mock(
  (_page?: unknown, _perPage?: unknown, _opts?: unknown) =>
    Promise.resolve({
      items: [owned("inst001")],
      totalItems: 1,
      totalPages: 1,
      page: 1,
      perPage: 10,
    }),
);

const mockCollection = mock((_name: string) => ({ getList: mockGetList }));

mock.module("../../utilities/pocketbase", () => ({
  pb: { collection: mockCollection },
}));

const { v2CardCollectionQuery } =
  await import("../../queries/queryFunctions/finicardCollection.query");

const render = (components: any[]): string =>
  JSON.stringify(components[0].toJSON());

describe("v2CardCollectionQuery", () => {
  beforeEach(() => {
    mockGetList.mockClear();
    mockCollection.mockClear();
  });

  it("is registered under the id the pagination context stores", () => {
    expect(v2CardCollectionQuery.id).toBe("v2_card_collection");
  });

  it("reads the v2 collection, expanding the definition", async () => {
    await v2CardCollectionQuery.query({
      page: 2,
      perPage: 10,
      filterOption: 'user_id = "user1" && server_id = "guild1"',
    });

    expect(mockCollection).toHaveBeenCalledWith("v2_user_card");
    expect(mockGetList).toHaveBeenCalledWith(2, 10, {
      sort: "-created",
      filter: 'user_id = "user1" && server_id = "guild1"',
      expand: "card",
    });
  });

  it("gives every card a View button carrying context, card and viewer", async () => {
    // The Back button needs the context id to restore the page, so all three
    // have to survive into the custom id.
    const { components, useComponentsV2 } =
      await v2CardCollectionQuery.buildResults({
        items: [owned("inst001")] as never,
        userId: "viewer9",
        contextId: "ctx123",
      });

    expect(useComponentsV2).toBe(true);
    expect(render(components!)).toContain(
      "v2_card_view:ctx123:inst001:viewer9",
    );
  });

  it("uses the owner label carried in the pagination context as its heading", async () => {
    const { components } = await v2CardCollectionQuery.buildResults({
      items: [owned("inst001")] as never,
      userId: "viewer9",
      queryString: "Pridgey — 23 cards",
      contextId: "ctx123",
    });

    expect(render(components!)).toContain("Pridgey — 23 cards");
  });

  it("shows the card's name, stats and id", async () => {
    const { components } = await v2CardCollectionQuery.buildResults({
      items: [owned("inst001")] as never,
      userId: "viewer9",
      contextId: "ctx123",
    });

    const text = render(components!);
    expect(text).toContain("Test Card");
    expect(text).toContain("7/5/3");
    expect(text).toContain("inst001");
  });

  it("skips a row whose definition failed to expand", async () => {
    // A dead relation would otherwise render a blank line with a live button.
    const broken = { ...owned("inst002"), expand: undefined };

    const { components } = await v2CardCollectionQuery.buildResults({
      items: [broken, owned("inst001")] as never,
      userId: "viewer9",
      contextId: "ctx123",
    });

    const text = render(components!);
    expect(text).not.toContain("inst002");
    expect(text).toContain("inst001");
  });

  it("marks a foil copy", async () => {
    const foil = { ...owned("inst003"), foil: true };

    const { components } = await v2CardCollectionQuery.buildResults({
      items: [foil] as never,
      userId: "viewer9",
      contextId: "ctx123",
    });

    expect(render(components!)).toContain("✨");
  });
});
