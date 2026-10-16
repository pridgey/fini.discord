import { describe, expect, it } from "bun:test";
import {
  blockAhead,
  DEFAULT_WANDER_CONFIG,
  decideWander,
  headingVector,
  headingTowards,
  horizontalDistance,
  initialWanderState,
  normaliseHeading,
  type Vec3,
  type WanderState,
} from "../../modules/minecraft/botWander";

const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/**
 * A stalled bot resets its course rather than stopping - stopping leaves it
 * stranded forever, since only gravity could ever move it again.
 */
const expectWedgeTurn = (action: { kind: string } & Record<string, unknown>) => {
  expect(action.kind).toBe("turn");
  expect(action.reason).toBe("wedged");
};
const ORIGIN = at(0, 80, 0);

/** Fixed "random" so heading choices are predictable. */
const fixedRandom = (value: number) => () => value;

const step = (
  position: Vec3,
  previous: Vec3 | null,
  state: WanderState,
  anchor: Vec3 = ORIGIN,
) =>
  decideWander({
    position,
    previous,
    anchor,
    state,
    random: fixedRandom(0.5),
  });

describe("horizontalDistance", () => {
  // Falling is not progress towards anywhere, so Y is ignored
  it("ignores vertical movement", () => {
    expect(horizontalDistance(at(0, 80, 0), at(0, 40, 0))).toBe(0);
    expect(horizontalDistance(at(3, 80, 4), at(0, 999, 0))).toBe(5);
  });
});

describe("headingTowards", () => {
  // Minecraft yaw: 0 is +Z (south), increasing clockwise
  it("points south for +Z", () => {
    expect(headingTowards(ORIGIN, at(0, 80, 10))).toBeCloseTo(0, 5);
  });

  it("points north for -Z", () => {
    expect(Math.abs(headingTowards(ORIGIN, at(0, 80, -10)))).toBeCloseTo(180, 5);
  });

  it("points west for +X", () => {
    expect(headingTowards(ORIGIN, at(10, 80, 0))).toBeCloseTo(-90, 5);
  });
});

describe("normaliseHeading", () => {
  it("wraps into [-180, 180)", () => {
    expect(normaliseHeading(0)).toBe(0);
    expect(normaliseHeading(190)).toBe(-170);
    expect(normaliseHeading(-190)).toBe(170);
    expect(normaliseHeading(540)).toBe(-180);
  });
});

describe("decideWander", () => {
  it("walks on the first sample, when there is no movement to judge yet", () => {
    const { action } = step(ORIGIN, null, initialWanderState());
    expect(action.kind).toBe("walk");
  });

  it("keeps walking while making progress", () => {
    const { action, state } = step(at(0, 80, 8), at(0, 80, 0), initialWanderState());
    expect(action.kind).toBe("walk");
    expect(state.noProgressSamples).toBe(0);
  });

  /*
   * Confirmed in game: walking into a 1-block step stops the bot dead (it
   * drifted 0.2 blocks in 6 seconds), and `jump interval 10` cleared it and
   * carried on for another 22 blocks. So a jump is always the first response.
   */
  it("jumps the first time it stops making progress", () => {
    const { action, state } = step(at(0, 80, 0), at(0, 80, 0), initialWanderState());
    expect(action.kind).toBe("jump");
    expect(state.noProgressSamples).toBe(1);
  });

  it("turns once jumping has failed", () => {
    let state = initialWanderState();
    const kinds: string[] = [];
    for (let i = 0; i <= DEFAULT_WANDER_CONFIG.turnAfter; i++) {
      const result = step(at(0, 80, 0), at(0, 80, 0), state);
      kinds.push(result.action.kind);
      state = result.state;
    }
    // Jumps up to turnAfter, then gives up on the heading
    expect(kinds).toEqual(["jump", "turn", "turn"]);
  });

  /*
   * A uniformly random heading points back into the wall roughly half the
   * time. In game that showed up as jump/jump/turn thrashing that netted only
   * 5 blocks in a minute, so a blocked turn must be a real change of course.
   */
  it("turns at least a quarter turn away from the blocked heading", () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      let state = initialWanderState(0);
      let result = decideWander({
        position: at(0, 80, 0),
        previous: at(0, 80, 0),
        anchor: ORIGIN,
        state,
        random: fixedRandom(roll),
      });
      // Escalate until it gives up on the heading
      while (result.action.kind !== "turn") {
        result = decideWander({
          position: at(0, 80, 0),
          previous: at(0, 80, 0),
          anchor: ORIGIN,
          state: result.state,
          random: fixedRandom(roll),
        });
      }

      const turned = Math.abs(
        result.action.kind === "turn" ? result.action.heading : 0,
      );
      // Away from 0 by at least 90 degrees, in either direction
      expect(turned).toBeGreaterThanOrEqual(90);
    }
  });

  it("reports wedged rather than flailing forever", () => {
    let last = step(at(0, 80, 0), at(0, 80, 0), initialWanderState());
    for (let i = 1; i < DEFAULT_WANDER_CONFIG.wedgedWindow; i++) {
      last = step(at(0, 80, 0), at(0, 80, 0), last.state);
    }
    expectWedgeTurn(last.action);
  });

  /*
   * The failure that mattered in game: trapped in a crevice, the bot bounced
   * between two points 1.4 blocks apart. Every single sample cleared
   * progressThreshold, so it looked like healthy walking while net movement
   * over 90 seconds was 1.4 blocks.
   */
  it("detects oscillation that clears the per-sample threshold", () => {
    const a = at(403.3, 58, 452.3);
    const b = at(403.3, 58, 453.7);
    // Anchored where it is stuck, so the leash doesn't take priority
    const anchor = a;

    let last = step(a, null, initialWanderState(), anchor);
    for (let i = 1; i < DEFAULT_WANDER_CONFIG.wedgedWindow; i++) {
      const position = i % 2 === 0 ? a : b;
      const previous = i % 2 === 0 ? b : a;
      // Each hop clears the threshold on its own
      expect(horizontalDistance(position, previous)).toBeGreaterThan(
        DEFAULT_WANDER_CONFIG.progressThreshold,
      );
      last = step(position, previous, last.state, anchor);
    }

    expectWedgeTurn(last.action);
  });

  it("does not call genuine walking wedged", () => {
    let last = step(at(0, 80, 0), null, initialWanderState());
    let z = 0;
    for (let i = 1; i < DEFAULT_WANDER_CONFIG.wedgedWindow * 2; i++) {
      const previous = at(0, 80, z);
      z += 8; // roughly a 3 second walk
      last = step(at(0, 80, z), previous, last.state);
      const reason = last.action.kind === "turn" ? last.action.reason : null;
      expect(reason).not.toBe("wedged");
    }
  });

  it("resets the stuck count as soon as it moves again", () => {
    const stuck = step(at(0, 80, 0), at(0, 80, 0), initialWanderState());
    expect(stuck.state.noProgressSamples).toBe(1);

    const freed = step(at(0, 80, 9), at(0, 80, 0), stuck.state);
    expect(freed.action.kind).toBe("walk");
    expect(freed.state.noProgressSamples).toBe(0);
  });

  it("drifts onto a new heading so the walk isn't a straight line", () => {
    let state = initialWanderState();
    let position = at(0, 80, 0);
    const kinds: string[] = [];
    // One sample past the hold window, so the drift has to have fired
    for (let i = 0; i <= DEFAULT_WANDER_CONFIG.headingHoldSamples; i++) {
      const previous = position;
      position = at(0, 80, position.z + 8);
      const result = step(position, previous, state);
      kinds.push(result.action.kind);
      state = result.state;
    }

    // Walks out the hold window, turns once, then settles onto the new heading
    expect(kinds.filter((k) => k === "turn")).toHaveLength(1);
    expect(kinds.indexOf("turn")).toBe(
      DEFAULT_WANDER_CONFIG.headingHoldSamples - 1,
    );
    expect(state.samplesOnHeading).toBe(1);
  });

  /*
   * The leash is the only thing standing between an aimless walker and endless
   * terrain generation, so it has to beat every other rule - including being
   * stuck, which is otherwise the most urgent case.
   */
  describe("leash", () => {
    const outside = at(0, 80, DEFAULT_WANDER_CONFIG.leashRadius + 10);

    it("recalls towards the anchor once outside the radius", () => {
      const { action } = step(outside, at(0, 80, 100), initialWanderState());
      expect(action.kind).toBe("recall");
      // Anchor is back towards -Z, which is north
      if (action.kind === "recall") {
        expect(Math.abs(action.heading)).toBeCloseTo(180, 5);
      }
    });

    it("overrides being stuck", () => {
      const stuckState: WanderState = {
        heading: 0,
        noProgressSamples: DEFAULT_WANDER_CONFIG.wedgedWindow + 5,
        samplesOnHeading: 0,
        recent: Array.from({ length: DEFAULT_WANDER_CONFIG.wedgedWindow }, () =>
          outside,
        ),
        wedgeResets: 0,
      };
      const { action } = step(outside, outside, stuckState);
      expect(action.kind).toBe("recall");
    });

    it("does not recall just inside the radius", () => {
      const inside = at(0, 80, DEFAULT_WANDER_CONFIG.leashRadius - 1);
      const { action } = step(inside, at(0, 80, 100), initialWanderState());
      expect(action.kind).not.toBe("recall");
    });
  });
});

describe("headingVector / blockAhead", () => {
  // Minecraft yaw: 0 faces +Z, increasing clockwise, so +X sits at -90
  it("points along +Z at yaw 0", () => {
    const { dx, dz } = headingVector(0);
    expect(dx).toBeCloseTo(0, 5);
    expect(dz).toBeCloseTo(1, 5);
  });

  it("points along +X at yaw -90", () => {
    const { dx, dz } = headingVector(-90);
    expect(dx).toBeCloseTo(1, 5);
    expect(dz).toBeCloseTo(0, 5);
  });

  it("gives the block one step ahead", () => {
    expect(blockAhead(at(10.5, 64.0, 20.5), 0)).toEqual({
      x: 10,
      y: 64,
      z: 21,
    });
    expect(blockAhead(at(10.5, 64.0, 20.5), -90)).toEqual({
      x: 11,
      y: 64,
      z: 20,
    });
  });
});

describe("decideWander with senses", () => {
  const clear = { safeDistanceAhead: DEFAULT_WANDER_CONFIG.lookaheadBlocks };

  const sensed = (
    senses: { safeDistanceAhead: number | null; headroom?: boolean },
    state = initialWanderState(),
    previous: Vec3 | null = at(0, 80, 0),
  ) =>
    decideWander({
      position: at(0, 80, 8),
      previous,
      anchor: ORIGIN,
      state,
      senses,
      random: fixedRandom(0.5),
    });

  it("walks on when the ground ahead runs clear", () => {
    expect(sensed(clear).action.kind).toBe("walk");
  });

  /*
   * The failure that ended both live runs. A one-block probe cannot prevent
   * this: at roughly four blocks a second the bot covers about six blocks
   * between samples, so the drop has to be seen while there is room to turn.
   */
  it("turns before reaching a drop", () => {
    const { action } = sensed({ safeDistanceAhead: 1 });
    expect(action.kind).toBe("turn");
  });

  it("turns as soon as safe ground is shorter than the stopping distance", () => {
    const justUnsafe = DEFAULT_WANDER_CONFIG.minSafeAhead - 1;
    expect(sensed({ safeDistanceAhead: justUnsafe }).action.kind).toBe("turn");
    expect(
      sensed({ safeDistanceAhead: DEFAULT_WANDER_CONFIG.minSafeAhead }).action
        .kind,
    ).toBe("walk");
  });

  // Sensing is best effort; unreadable must not mean "hazard"
  it("keeps walking when the ground could not be read", () => {
    expect(sensed({ safeDistanceAhead: null }).action.kind).toBe("walk");
  });

  it("turns instead of jumping when there is no headroom", () => {
    const stuck = at(0, 80, 8);
    const { action } = decideWander({
      position: stuck,
      previous: stuck,
      anchor: ORIGIN,
      state: initialWanderState(),
      senses: { ...clear, headroom: false },
      random: fixedRandom(0.5),
    });
    expect(action.kind).toBe("turn");
  });

  it("still jumps when headroom is clear, or was never probed", () => {
    const stuck = at(0, 80, 8);
    for (const senses of [{ ...clear, headroom: true }, clear]) {
      const { action } = decideWander({
        position: stuck,
        previous: stuck,
        anchor: ORIGIN,
        state: initialWanderState(),
        senses,
        random: fixedRandom(0.5),
      });
      expect(action.kind).toBe("jump");
    }
  });
});

describe("rescue escalation", () => {
  const spot = { x: 403.3, y: 58, z: 452.3 };

  /** Runs enough identical samples to fill the wedge window once. */
  const stallOnce = (state: WanderState) => {
    let last = decideWander({
      position: spot,
      previous: spot,
      anchor: spot,
      state,
      random: fixedRandom(0.5),
    });
    for (let i = 1; i < DEFAULT_WANDER_CONFIG.wedgedWindow; i++) {
      last = decideWander({
        position: spot,
        previous: spot,
        anchor: spot,
        state: last.state,
        random: fixedRandom(0.5),
      });
    }
    return last;
  };

  /*
   * Teleporting is the one thing here that doesn't move the bot on its own
   * feet, so it must stay a genuine last resort - only after resetting course
   * has repeatedly failed to free it.
   */
  it("resets course before resorting to a teleport", () => {
    let result = stallOnce(initialWanderState());
    expectWedgeTurn(result.action);

    for (let i = 1; i <= DEFAULT_WANDER_CONFIG.rescueAfterWedges - 1; i++) {
      result = stallOnce(result.state);
      expectWedgeTurn(result.action);
    }

    // One stall past the allowance, and it gives up on walking out
    result = stallOnce(result.state);
    expect(result.action.kind).toBe("rescue");
  });

  it("clears the escalation after a rescue, so it starts fresh", () => {
    let result = stallOnce(initialWanderState());
    while (result.action.kind !== "rescue") {
      result = stallOnce(result.state);
    }
    expect(result.state.wedgeResets).toBe(0);
    expect(result.state.recent).toHaveLength(0);
  });

  // Walking normally must not accumulate towards a teleport
  it("forgets earlier stalls once it is covering ground again", () => {
    let result = stallOnce(initialWanderState());
    expect(result.state.wedgeResets).toBe(1);

    let z = 0;
    for (let i = 0; i < DEFAULT_WANDER_CONFIG.wedgedWindow; i++) {
      const previous = at(0, 80, z);
      z += 8;
      result = decideWander({
        position: at(0, 80, z),
        previous,
        anchor: ORIGIN,
        state: result.state,
        random: fixedRandom(0.5),
      });
    }

    expect(result.state.wedgeResets).toBe(0);
  });
});

describe("water", () => {
  // Anchored near the pond, so the leash doesn't take priority
  const anchor = at(250, 52, 522);

  /*
   * Found in game: the bot walked into an ocean and was 193 blocks out, fully
   * submerged, walking the seabed. The ground lookahead cannot catch this -
   * water is not air, so an ocean reads as solid footing - so being in water
   * has to be handled directly.
   */
  it("swims instead of walking when in water", () => {
    const { action } = decideWander({
      position: at(252.6, 52.8, 524.3),
      previous: at(250.0, 52.8, 522.0),
      anchor,
      state: initialWanderState(),
      senses: { safeDistanceAhead: 8, inWater: true },
      random: fixedRandom(0.5),
    });
    expect(action.kind).toBe("swim");
  });

  // Submerged and barely moving must not read as a wall to turn away from
  it("swims even when making no progress", () => {
    const stuck = at(252.6, 52.8, 524.3);
    const { action } = decideWander({
      position: stuck,
      previous: stuck,
      anchor,
      state: initialWanderState(),
      senses: { safeDistanceAhead: 8, inWater: true },
      random: fixedRandom(0.5),
    });
    expect(action.kind).toBe("swim");
  });

  it("walks again once out of the water", () => {
    const { action } = decideWander({
      position: at(0, 80, 8),
      previous: at(0, 80, 0),
      anchor: ORIGIN,
      state: initialWanderState(),
      senses: { safeDistanceAhead: 8, inWater: false },
      random: fixedRandom(0.5),
    });
    expect(action.kind).toBe("walk");
  });

  // The leash still has to win, or a bot in a big ocean never comes home
  it("still obeys the leash while swimming", () => {
    const farOut = at(0, 52, DEFAULT_WANDER_CONFIG.leashRadius + 40);
    const { action } = decideWander({
      position: farOut,
      previous: at(0, 52, DEFAULT_WANDER_CONFIG.leashRadius + 35),
      anchor,
      state: initialWanderState(),
      senses: { safeDistanceAhead: 8, inWater: true },
      random: fixedRandom(0.5),
    });
    expect(action.kind).toBe("recall");
  });
});
