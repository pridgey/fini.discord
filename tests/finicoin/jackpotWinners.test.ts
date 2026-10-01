import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockCreate = mock((data?: any) => Promise.resolve({ id: "rec1", ...data }));
const mockGetFirstListItem = mock((_filter?: string, _opts?: any) =>
  Promise.resolve({ id: "existing" } as any),
);
const mockCollection = mock(() => ({
  create: mockCreate,
  getFirstListItem: mockGetFirstListItem,
}));

mock.module("../../utilities/pocketbase", () => ({
  pb: { collection: mockCollection },
}));

const { recordJackpotWin, findJackpotWin } = await import(
  "../../modules/finicoin/jackpotWinners"
);

describe("recordJackpotWin", () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockGetFirstListItem.mockClear();
    mockCollection.mockClear();
  });

  it("should write the win to jackpot_winners", async () => {
    await recordJackpotWin({
      userId: "u1",
      serverId: "s1",
      username: "Pridgey",
      servername: "gekinzuku",
      amount: 21704.5,
      messageId: "m1",
      channelId: "c1",
    });

    expect(mockCollection).toHaveBeenCalledWith("jackpot_winners");
    const written = mockCreate.mock.calls[0][0];
    expect(written.user_id).toBe("u1");
    expect(written.username).toBe("Pridgey");
    expect(written.amount).toBe(21704.5);
    expect(written.identifier).toBe("Pridgey-gekinzuku");
  });

  it("should default to a live win at the current time", async () => {
    const before = Date.now();
    await recordJackpotWin({
      userId: "u1",
      serverId: "s1",
      username: "n",
      servername: "g",
      amount: 10,
    });

    const written = mockCreate.mock.calls[0][0];
    expect(written.source).toBe("live");
    expect(new Date(written.won_at).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("should keep the historical timestamp when backfilling", async () => {
    const wonAt = new Date("2024-03-24T01:52:10.492Z");

    await recordJackpotWin({
      userId: "u1",
      serverId: "s1",
      username: "Yoshi",
      servername: "g",
      amount: 2131648,
      wonAt,
      source: "backfill-log",
    });

    const written = mockCreate.mock.calls[0][0];
    expect(written.won_at).toBe(wonAt.toISOString());
    expect(written.source).toBe("backfill-log");
  });

  it("should round payouts to cents", async () => {
    await recordJackpotWin({
      userId: "u1",
      serverId: "s1",
      username: "n",
      servername: "g",
      amount: 100.129999,
    });

    expect(mockCreate.mock.calls[0][0].amount).toBe(100.13);
  });

  it("should swallow write failures rather than break the payout", async () => {
    mockCreate.mockRejectedValueOnce(new Error("pocketbase down"));

    const result = await recordJackpotWin({
      userId: "u1",
      serverId: "s1",
      username: "n",
      servername: "g",
      amount: 10,
    });

    expect(result).toBeNull();
  });
});

describe("findJackpotWin", () => {
  beforeEach(() => {
    mockGetFirstListItem.mockClear();
  });

  it("should query won_at in PocketBase's space-separated date format", async () => {
    // Regression: PocketBase normalises stored dates to "YYYY-MM-DD HH:MM:SS.sssZ"
    // and compares filters literally, so an ISO "T" here matches nothing and the
    // backfill re-inserts every row on a second run.
    await findJackpotWin("s1", "u1", new Date("2024-01-18T23:17:18.878Z"));

    const filter = mockGetFirstListItem.mock.calls[0][0] as string;
    expect(filter).toContain('won_at = "2024-01-18 23:17:18.878Z"');
    expect(filter).not.toContain("2024-01-18T23:17:18.878Z");
    expect(filter).toContain('server_id = "s1"');
    expect(filter).toContain('user_id = "u1"');
  });

  it("should treat a miss as absent rather than an error", async () => {
    mockGetFirstListItem.mockRejectedValueOnce({ status: 404 });

    expect(
      await findJackpotWin("s1", "u1", new Date("2024-01-18T23:17:18.878Z")),
    ).toBeNull();
  });
});
