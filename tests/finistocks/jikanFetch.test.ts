import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// stockData imports the PocketBase client; jikanFetch never touches it
mock.module("../../utilities/pocketbase", () => ({ pb: {} }));

const { jikanFetch, jikanTiming } = await import(
  "../../modules/finistocks/stockData"
);

const realFetch = globalThis.fetch;
const realTiming = { ...jikanTiming };

// Answers each request with the next status in the list; 200s carry a body
const answer = (statuses: number[], headers: Record<string, string> = {}) => {
  const calls: string[] = [];
  globalThis.fetch = mock(async (url: string | URL | Request) => {
    calls.push(String(url));
    const status = statuses[calls.length - 1] ?? 200;
    return new Response(JSON.stringify({ data: { mal_id: 1 } }), {
      status,
      headers,
    });
  }) as unknown as typeof fetch;
  return calls;
};

describe("jikanFetch", () => {
  beforeEach(() => {
    Object.assign(jikanTiming, { spacingMs: 0, backoffMs: 5, attempts: 4 });
    console.warn = mock(() => {});
    console.error = mock(() => {});
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    Object.assign(jikanTiming, realTiming);
  });

  it("returns the body on success", async () => {
    const calls = answer([200]);
    expect(await jikanFetch<unknown>("/anime/1")).toEqual({ data: { mal_id: 1 } });
    expect(calls).toEqual(["https://api.jikan.moe/v4/anime/1"]);
  });

  it("retries a 429 and then succeeds", async () => {
    const calls = answer([429, 429, 200]);
    expect(await jikanFetch<unknown>("/anime/1")).toEqual({ data: { mal_id: 1 } });
    expect(calls.length).toBe(3);
  });

  it("retries a 5xx and then succeeds", async () => {
    const calls = answer([503, 500, 200]);
    expect(await jikanFetch("/anime/1")).not.toBeNull();
    expect(calls.length).toBe(3);
  });

  it("retries when the request itself fails", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      if (calls === 1) throw new Error("socket hang up");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await jikanFetch<unknown>("/anime/1")).toEqual({});
    expect(calls).toBe(2);
  });

  it("gives up after the last attempt", async () => {
    const calls = answer([429, 429, 429, 429, 429]);
    expect(await jikanFetch("/anime/1")).toBeNull();
    expect(calls.length).toBe(4);
  });

  it("does not retry other client errors", async () => {
    const calls = answer([404]);
    expect(await jikanFetch("/anime/1")).toBeNull();
    expect(calls.length).toBe(1);
  });

  it("waits longer each time it backs off", async () => {
    const times: number[] = [];
    globalThis.fetch = mock(async () => {
      times.push(Date.now());
      return new Response("{}", { status: times.length < 4 ? 503 : 200 });
    }) as unknown as typeof fetch;
    jikanTiming.backoffMs = 40;
    await jikanFetch("/anime/1");
    const gaps = times.slice(1).map((time, i) => time - times[i]);
    expect(gaps[0]).toBeGreaterThanOrEqual(40);
    expect(gaps[1]).toBeGreaterThanOrEqual(80);
    expect(gaps[2]).toBeGreaterThanOrEqual(160);
  });

  it("follows Retry-After when Jikan sends it", async () => {
    const times: number[] = [];
    globalThis.fetch = mock(async () => {
      times.push(Date.now());
      return new Response("{}", {
        status: times.length < 2 ? 429 : 200,
        headers: { "retry-after": "1" },
      });
    }) as unknown as typeof fetch;
    await jikanFetch("/anime/1");
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1000);
  });
});
