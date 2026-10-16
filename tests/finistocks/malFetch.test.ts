import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// stockData imports the PocketBase client; malFetch never touches it
mock.module("../../utilities/pocketbase", () => ({ pb: {} }));

const { malFetch, malTiming, snapshotOf } = await import(
  "../../modules/finistocks/stockData"
);

const realFetch = globalThis.fetch;
/**
 * A timer can measure a millisecond or two short against Date.now() under
 * load, which made these fail now and then. The waits still have to double.
 */
const TIMER_SLACK_MS = 3;
let sentHeaders: (string | null)[] = [];
const realTiming = { ...malTiming };
const realClientId = process.env.MAL_CLIENT_ID;

// Answers each request with the next status in the list; 200s carry a body
const answer = (statuses: number[], headers: Record<string, string> = {}) => {
  const calls: string[] = [];
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    sentHeaders.push(new Headers(init?.headers).get("x-mal-client-id"));
    const status = statuses[calls.length - 1] ?? 200;
    return new Response(JSON.stringify({ data: { mal_id: 1 } }), {
      status,
      headers,
    });
  }) as unknown as typeof fetch;
  return calls;
};

describe("malFetch", () => {
  beforeEach(() => {
    Object.assign(malTiming, { spacingMs: 0, backoffMs: 5, attempts: 4 });
    process.env.MAL_CLIENT_ID = "test-client";
    sentHeaders = [];
    console.warn = mock(() => {});
    console.error = mock(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    Object.assign(malTiming, realTiming);
    process.env.MAL_CLIENT_ID = realClientId;
  });

  it("returns the body on success", async () => {
    const calls = answer([200]);
    expect(await malFetch<unknown>("/anime/1")).toEqual({ data: { mal_id: 1 } });
    expect(calls).toEqual(["https://api.myanimelist.net/v2/anime/1"]);
    expect(sentHeaders).toEqual(["test-client"]);
  });

  it("follows a paging link as given", async () => {
    const calls = answer([200]);
    const next = "https://api.myanimelist.net/v2/anime/season/2026/fall?offset=500&limit=500";
    await malFetch(next);
    expect(calls).toEqual([next]);
  });

  it("asks nothing of MAL without a client id", async () => {
    delete process.env.MAL_CLIENT_ID;
    const calls = answer([200]);
    expect(await malFetch("/anime/1")).toBeNull();
    expect(calls).toEqual([]);
  });

  it("gives up on a request that never answers", async () => {
    malTiming.timeoutMs = 20;
    malTiming.attempts = 1;
    globalThis.fetch = mock(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    ) as unknown as typeof fetch;
    expect(await malFetch("/anime/1")).toBeNull();
  });

  it("retries a 429 and then succeeds", async () => {
    const calls = answer([429, 429, 200]);
    expect(await malFetch<unknown>("/anime/1")).toEqual({ data: { mal_id: 1 } });
    expect(calls.length).toBe(3);
  });

  it("retries a 5xx and then succeeds", async () => {
    const calls = answer([503, 500, 200]);
    expect(await malFetch("/anime/1")).not.toBeNull();
    expect(calls.length).toBe(3);
  });

  it("retries when the request itself fails", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      if (calls === 1) throw new Error("socket hang up");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await malFetch<unknown>("/anime/1")).toEqual({});
    expect(calls).toBe(2);
  });

  it("gives up after the last attempt", async () => {
    const calls = answer([429, 429, 429, 429, 429]);
    expect(await malFetch("/anime/1")).toBeNull();
    expect(calls.length).toBe(4);
  });

  it("quietly finds nothing at a 404", async () => {
    const calls = answer([404]);
    expect(await malFetch("/anime/season/2027/fall?limit=500")).toBeNull();
    expect(calls.length).toBe(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("does not retry other client errors", async () => {
    const calls = answer([403]);
    expect(await malFetch("/anime/1")).toBeNull();
    expect(calls.length).toBe(1);
  });

  it("waits longer each time it backs off", async () => {
    const times: number[] = [];
    globalThis.fetch = mock(async () => {
      times.push(Date.now());
      return new Response("{}", { status: times.length < 4 ? 503 : 200 });
    }) as unknown as typeof fetch;
    malTiming.backoffMs = 40;
    await malFetch("/anime/1");
    const gaps = times.slice(1).map((time, i) => time - times[i]);
    expect(gaps[0]).toBeGreaterThanOrEqual(40 - TIMER_SLACK_MS);
    expect(gaps[1]).toBeGreaterThanOrEqual(80 - TIMER_SLACK_MS);
    expect(gaps[2]).toBeGreaterThanOrEqual(160 - TIMER_SLACK_MS);
  });

  it("follows Retry-After when MAL sends it", async () => {
    const times: number[] = [];
    globalThis.fetch = mock(async () => {
      times.push(Date.now());
      return new Response("{}", {
        status: times.length < 2 ? 429 : 200,
        headers: { "retry-after": "1" },
      });
    }) as unknown as typeof fetch;
    await malFetch("/anime/1");
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1000 - TIMER_SLACK_MS);
  });
});

describe("snapshotOf", () => {
  it("reads MAL's fields into what pricing uses", () => {
    expect(
      snapshotOf({
        id: 59978,
        title: "Sousou no Frieren 2nd Season",
        alternative_titles: { en: "Frieren: Beyond Journey's End Season 2" },
        main_picture: { medium: "m.jpg", large: "l.jpg" },
        synopsis: "More Frieren.",
        mean: 9.1,
        rank: 3,
        popularity: 812,
        num_list_users: 402113,
        status: "currently_airing",
        start_season: { year: 2026, season: "winter" },
      }),
    ).toEqual({
      mal_id: 59978,
      title: "Frieren: Beyond Journey's End Season 2",
      image_url: "l.jpg",
      synopsis: "More Frieren.",
      status: "ongoing",
      popularity: 812,
      members: 402113,
      favorites: 0,
      score: 9.1,
      rank: 3,
      season: "winter",
      year: 2026,
    });
  });

  it("maps every MAL status, and copes with an unscored, undated anime", () => {
    expect(snapshotOf({ id: 1, title: "A", status: "not_yet_aired" }).status).toBe("upcoming");
    expect(snapshotOf({ id: 1, title: "A", status: "finished_airing" }).status).toBe("finished");
    const bare = snapshotOf({ id: 1, title: "Untitled" });
    expect(bare.title).toBe("Untitled");
    expect([bare.score, bare.rank, bare.season, bare.year]).toEqual([0, 0, null, null]);
  });
});
