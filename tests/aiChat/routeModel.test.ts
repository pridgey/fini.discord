import { afterEach, describe, expect, it } from "bun:test";
import {
  FOLLOW_UP_THRESHOLD,
  HEAVY_THRESHOLD,
  decideTier,
  isHeavyAvailable,
  rememberTier,
  routeMessage,
} from "../../modules/aiChat/routeModel";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stubs fetch with a handler, recording each request body. */
const stubFetch = (handler: (url: string, body?: any) => Response) => {
  const bodies: any[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    bodies.push(body);
    return handler(String(input), body);
  }) as typeof fetch;
  return bodies;
};

/** A /v1/systemone reply giving every option of the question probability p. */
const routerReply = (p: number) =>
  Response.json({
    answers: {
      q: {
        type: "choice",
        probabilities: { light: 1 - p, heavy: p, new: 1 - p, continues: p },
      },
    },
  });

describe("decideTier", () => {
  it("sends a message to the big model once it clears the bar on its own", () => {
    expect(decideTier(HEAVY_THRESHOLD).tier).toBe("heavy");
    expect(decideTier(HEAVY_THRESHOLD - 0.01).tier).toBe("light");
  });

  // "continue" alone is light, but after a long music-theory answer it should
  // be finished by the model that started it.
  it("keeps a follow-up with the big model", () => {
    expect(decideTier(0.06, 0.74)).toEqual({
      tier: "heavy",
      reason: "follow-up to the bigger model's answer",
    });
  });

  // "thanks fini!" after that same answer was 31%.
  it("lets chatter after a heavy answer go back to the light model", () => {
    expect(decideTier(0.05, FOLLOW_UP_THRESHOLD - 0.01).tier).toBe("light");
  });

  it("is light when there was nothing to follow up", () => {
    expect(decideTier(0.1, undefined).tier).toBe("light");
  });
});

describe("routeMessage", () => {
  const previous = { asked: "q", answered: "a" };

  it("judges the message alone after a light answer", async () => {
    const bodies = stubFetch(() => routerReply(0.1));
    rememberTier("after-light", "light");

    await routeMessage("continue", "after-light", previous);

    expect(bodies).toHaveLength(1);
    expect(bodies[0].state).toEqual({ message: "continue" });
  });

  it("also checks for a follow-up after a heavy answer", async () => {
    const bodies = stubFetch(() => routerReply(0.1));
    rememberTier("after-heavy", "heavy");

    await routeMessage("continue", "after-heavy", previous);

    expect(bodies).toHaveLength(2);
    expect(bodies.some((b) => b.state.previous_exchange)).toBe(true);
  });

  it("shows only the start of a long previous answer", async () => {
    const bodies = stubFetch(() => routerReply(0.1));
    rememberTier("long", "heavy");

    await routeMessage("continue", "long", {
      asked: "q",
      answered: "x".repeat(5000),
    });

    const withContext = bodies.find((b) => b.state.previous_exchange);
    expect(withContext.state.previous_exchange.answered.length).toBeLessThan(
      400,
    );
  });

  it("routes on the probabilities it gets back", async () => {
    stubFetch(() => routerReply(0.9));
    expect((await routeMessage("is Eb7 the same as Ebmaj7?", "k")).tier).toBe(
      "heavy",
    );
  });

  // Gemma's image support is tested; the big model's isn't.
  it("keeps images on the light model without asking the router", async () => {
    const bodies = stubFetch(() => routerReply(0.99));
    const decision = await routeMessage("what is this?", "k", undefined, true);

    expect(decision.tier).toBe("light");
    expect(bodies).toHaveLength(0);
  });

  // Before routing, every message went to Gemma - so that's the safe fallback.
  it("falls back to the light model when the router is down", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    expect(await routeMessage("anything", "k")).toEqual({
      tier: "light",
      reason: "router unavailable",
    });
  });

  it("falls back to the light model on a malformed reply", async () => {
    stubFetch(() => Response.json({ answers: {} }));
    expect((await routeMessage("anything", "k")).tier).toBe("light");
  });
});

describe("isHeavyAvailable", () => {
  it("is available when any slot is free", async () => {
    stubFetch(() =>
      Response.json([{ is_processing: true }, { is_processing: false }]),
    );
    expect(await isHeavyAvailable()).toBe(true);
  });

  // It's a shared server: a chat message shouldn't queue behind other work.
  it("is unavailable when every slot is busy", async () => {
    stubFetch(() =>
      Response.json([{ is_processing: true }, { is_processing: true }]),
    );
    expect(await isHeavyAvailable()).toBe(false);
  });

  it("is unavailable when the server can't be reached", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await isHeavyAvailable()).toBe(false);
  });

  it("falls back to the health check when slots are turned off", async () => {
    stubFetch((url) =>
      url.endsWith("/slots")
        ? new Response("", { status: 501 })
        : new Response("ok", { status: 200 }),
    );
    expect(await isHeavyAvailable()).toBe(true);
  });
});
