/**
 * Decides what a wandering bot should do next.
 *
 * Deliberately blind. The goal is aimless wandering, which has no destination,
 * so there is nothing to path *to* - and that removes the need to read the
 * world at all. Walking into things and reacting gets the two behaviours that
 * matter for free:
 *
 * - **climbing** - a jump clears the 1-block steps that stop a walking player
 * - **water** - players swim on their own, so `forward` crosses it unaided
 *
 * Reading blocks to plan around obstacles would mean either 37ms per probe
 * over RCON or a KubeJS script living inside the modpack (wiped by every pack
 * update). Neither buys anything here.
 *
 * Kept free of RCON and of any clock so the escalation can be unit tested.
 */

export type Vec3 = { x: number; y: number; z: number };

export type WanderConfig = {
  /** How far from the anchor the bot may roam, in blocks. */
  leashRadius: number;
  /**
   * Minimum horizontal distance between samples that still counts as progress.
   *
   * Measured on this server at a 3 second sample: fully blocked by a one-block
   * wall drifts about 0.1 blocks, grinding uphill still makes about 1.1, and
   * clear walking makes 6 or more. 1.0 separates "stuck" from "slow" with the
   * bias towards treating slow movement as progress - a needless jump is
   * harmless, but jumping instead of noticing a wall wastes the escalation.
   */
  progressThreshold: number;
  /** Samples of no progress before trying to jump the obstacle. */
  jumpAfter: number;
  /**
   * Samples of no progress before giving up on this heading. Low because the
   * terrain here is rough: the bot meets plenty of obstacles taller than the
   * one block a jump can clear, and waiting it out just wastes time.
   */
  turnAfter: number;
  /**
   * How many recent samples to judge net progress over.
   *
   * Counting consecutive no-progress samples is not enough on its own: a bot
   * trapped in a crevice oscillates between two points about 1.4 blocks apart,
   * which clears `progressThreshold` every single sample and reads as healthy
   * walking while it goes nowhere. Observed in game - 1.4 blocks of net
   * movement in 90 seconds, with the escalation never firing once.
   */
  wedgedWindow: number;
  /**
   * Net distance the bot must cover across `wedgedWindow` samples. Below this
   * it is going nowhere, however much it is thrashing.
   */
  wedgedRadius: number;
  /** Samples to hold a heading before drifting to a new one. */
  headingHoldSamples: number;
  /** How many blocks ahead to probe for walkable ground. */
  lookaheadBlocks: number;
  /**
   * Turn when safe ground runs out within this many blocks. Must exceed the
   * distance covered between samples, or the bot walks into the hazard before
   * it gets another decision.
   */
  minSafeAhead: number;
  /**
   * Consecutive course resets with no escape before falling back to a
   * teleport. A last resort: everything else here moves the bot on its own
   * feet, but a bot embedded in terrain has no way out under its own power.
   */
  rescueAfterWedges: number;
};

/**
 * Tuned for the 1.5 second sample interval the wander service uses. At a
 * walking pace of roughly four blocks a second that is about six blocks
 * covered per sample - hence a lookahead of eight and a turn at six.
 */
export const DEFAULT_WANDER_CONFIG: WanderConfig = {
  leashRadius: 150,
  progressThreshold: 1.0,
  jumpAfter: 1,
  turnAfter: 2,
  wedgedWindow: 10,
  wedgedRadius: 6,
  headingHoldSamples: 8,
  lookaheadBlocks: 8,
  minSafeAhead: 6,
  rescueAfterWedges: 2,
};

/**
 * The little the bot knows about what is in front of it.
 *
 * Probing one adjacent block is useless for avoiding a fall: at roughly four
 * blocks a second the bot covers about six blocks between samples, so by the
 * time a one-block reading is acted on it describes ground already behind it.
 * What matters is how far ahead the walkable ground runs.
 *
 * Undefined means no sensing was available, and the bot falls back to reacting
 * after the fact.
 */
export type WanderSenses = {
  /**
   * How many blocks of safe, walkable ground run ahead on the current heading,
   * capped at the lookahead. Null when it could not be read.
   */
  safeDistanceAhead: number | null;
  /**
   * Clear space above the bot's head, so a jump can actually lift it. Only
   * probed when the bot is stuck, so undefined most of the time.
   */
  headroom?: boolean;
  /** Standing in water, so it should be swimming rather than walking. */
  inWater?: boolean;
};

/**
 * Unit vector for a Minecraft yaw. Yaw 0 faces +Z, and increases clockwise,
 * which puts +X at -90.
 */
export const headingVector = (heading: number): { dx: number; dz: number } => {
  const radians = (heading * Math.PI) / 180;
  return { dx: -Math.sin(radians), dz: Math.cos(radians) };
};

/** The block coordinate one step ahead of a position on a heading. */
export const blockAhead = (
  position: Vec3,
  heading: number,
  distance = 1,
): { x: number; y: number; z: number } => {
  const { dx, dz } = headingVector(heading);
  return {
    x: Math.floor(position.x + dx * distance),
    y: Math.floor(position.y),
    z: Math.floor(position.z + dz * distance),
  };
};

export type WanderState = {
  /** Current heading in Minecraft yaw degrees. */
  heading: number;
  /** Consecutive samples with no meaningful movement. */
  noProgressSamples: number;
  /** Samples since the heading last changed. */
  samplesOnHeading: number;
  /** Recent positions, oldest first, for judging net progress. */
  recent: Vec3[];
  /** Consecutive course resets that failed to get the bot moving again. */
  wedgeResets: number;
};

export const initialWanderState = (heading = 0): WanderState => ({
  heading,
  noProgressSamples: 0,
  samplesOnHeading: 0,
  recent: [],
  wedgeResets: 0,
});

export type WanderAction =
  /** Hold the current heading. */
  | { kind: "walk" }
  /** Jump while walking, to climb a step. */
  | { kind: "jump" }
  /** Hold jump to stay at the surface while crossing water. */
  | { kind: "swim" }
  /**
   * Pick a new heading. `wedged` means net progress stalled over the whole
   * window - the bot is not giving up, it is resetting and trying elsewhere.
   */
  | { kind: "turn"; heading: number; reason: "blocked" | "drift" | "wedged" }
  /** Head back inside the leash. */
  | { kind: "recall"; heading: number }
  /**
   * Embedded in terrain with no way out on foot. The only remaining option is
   * a teleport, which is why it is gated behind repeated failed resets.
   */
  | { kind: "rescue" };

export type WanderDecision = {
  action: WanderAction;
  state: WanderState;
};

/** Horizontal distance only - falling isn't progress towards anywhere. */
export const horizontalDistance = (a: Vec3, b: Vec3): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Minecraft yaw: 0 is +Z (south), and it increases clockwise, so the angle to
 * a target is measured from -Z. Returned in [-180, 180).
 */
export const headingTowards = (from: Vec3, to: Vec3): number => {
  const yaw = (Math.atan2(-(to.x - from.x), to.z - from.z) * 180) / Math.PI;
  return normaliseHeading(yaw);
};

export const normaliseHeading = (heading: number): number => {
  const wrapped = ((heading + 180) % 360 + 360) % 360;
  return wrapped - 180;
};

/**
 * One wandering decision.
 *
 * `previous` is null on the first sample, when there is no movement to judge
 * yet. `random` returns [0, 1) and is injected so tests can choose headings.
 */
export const decideWander = (
  args: {
    position: Vec3;
    previous: Vec3 | null;
    anchor: Vec3;
    state: WanderState;
    config?: WanderConfig;
    random?: () => number;
    senses?: WanderSenses;
  },
): WanderDecision => {
  const {
    position,
    previous,
    anchor,
    state,
    config = DEFAULT_WANDER_CONFIG,
    random = Math.random,
    senses,
  } = args;

  /**
   * A heading at least a quarter turn away from the one that just failed.
   *
   * Picking a uniformly random heading instead means a good chance of facing
   * straight back into the wall that just stopped the bot - observed in game
   * as jump/jump/turn thrashing that netted 5 blocks in a minute.
   */
  const turnAway = () =>
    normaliseHeading(state.heading + 90 + random() * 180);

  /** A gentle change of course, so free walking meanders instead of zig-zagging. */
  const drift = () =>
    normaliseHeading(state.heading + (random() * 2 - 1) * 60);

  /*
   * The leash is checked first and overrides everything. Without it the bot
   * walks in a straight line forever, loading and generating fresh chunks the
   * whole way - the one way an aimless wanderer can genuinely hurt a server.
   */
  if (horizontalDistance(position, anchor) > config.leashRadius) {
    const heading = headingTowards(position, anchor);
    return {
      action: { kind: "recall", heading },
      state: {
        heading,
        noProgressSamples: 0,
        samplesOnHeading: 0,
        recent: [],
        wedgeResets: state.wedgeResets,
      },
    };
  }

  // Keep only the window the wedge check looks at
  const recent = [...state.recent, position].slice(-config.wedgedWindow);

  /*
   * Net progress across the whole window, which catches both being pinned in
   * place and oscillating between two points.
   */
  if (recent.length >= config.wedgedWindow) {
    const spread = Math.max(
      ...recent.map((point) => horizontalDistance(point, recent[0])),
    );
    if (spread < config.wedgedRadius) {
      const wedgeResets = state.wedgeResets + 1;

      /*
       * Resets have stopped working, which in practice means the bot is inside
       * terrain - a block probe at its own feet came back solid. No heading
       * gets it out, so hand over to a teleport.
       */
      if (wedgeResets > config.rescueAfterWedges) {
        return {
          action: { kind: "rescue" },
          state: {
            ...state,
            noProgressSamples: 0,
            samplesOnHeading: 0,
            recent: [],
            wedgeResets: 0,
          },
        };
      }

      /*
       * Stopping here was the first instinct and it was wrong: a stopped bot
       * never moves again, so it can only be freed by gravity. Reset instead -
       * new heading, clear the history, keep walking.
       */
      const heading = turnAway();
      return {
        action: { kind: "turn", heading, reason: "wedged" },
        state: {
          heading,
          noProgressSamples: 0,
          samplesOnHeading: 0,
          recent: [],
          wedgeResets,
        },
      };
    }
  }

  /*
   * Reaching here with a full window means the bot is demonstrably covering
   * ground, so any earlier stall is behind it and the rescue escalation starts
   * over.
   */
  const wedgeResets =
    recent.length >= config.wedgedWindow ? 0 : state.wedgeResets;

  /*
   * Turn before reaching a drop rather than after falling in. This is the
   * failure that ended both live runs: the bot walked off a ledge into the
   * same ravine, ended up inside the terrain, and could neither jump nor walk
   * out. The threshold has to exceed the ~6 blocks covered between samples.
   */
  if (
    senses &&
    senses.safeDistanceAhead !== null &&
    senses.safeDistanceAhead < config.minSafeAhead
  ) {
    const heading = turnAway();
    return {
      action: { kind: "turn", heading, reason: "blocked" },
      state: {
        heading,
        noProgressSamples: 0,
        samplesOnHeading: 0,
        recent,
        wedgeResets,
      },
    };
  }

  /*
   * In water, keep holding jump. A player that doesn't sinks and ends up
   * walking the seabed - which is exactly where the bot was found after it
   * wandered into an ocean, 193 blocks out and fully submerged. The ground
   * lookahead can't prevent that on its own, because water is not air and so
   * an ocean reads as solid footing.
   */
  if (senses?.inWater) {
    return {
      action: { kind: "swim" },
      state: {
        ...state,
        noProgressSamples: 0,
        samplesOnHeading: state.samplesOnHeading + 1,
        recent,
        wedgeResets,
      },
    };
  }

  const moved =
    previous === null ||
    horizontalDistance(position, previous) >= config.progressThreshold;

  if (!moved) {
    const noProgressSamples = state.noProgressSamples + 1;

    /*
     * With a block overhead a jump cannot lift the bot at all, so there is no
     * point working through the escalation - that is just bouncing in place.
     * Observed in game: y moved 58.0 to 58.1 while the bot was embedded in
     * terrain, instead of the ~1.25 a real jump gives.
     */
    const jumpCouldHelp = senses?.headroom !== false;

    // Out of jumps, or jumping was never going to work: this heading is a wall
    if (noProgressSamples >= config.turnAfter || !jumpCouldHelp) {
      const heading = turnAway();
      return {
        action: { kind: "turn", heading, reason: "blocked" },
        state: {
          heading,
          noProgressSamples,
          samplesOnHeading: 0,
          recent,
          wedgeResets,
        },
      };
    }

    // A jump first: most things in the way are one block tall
    if (noProgressSamples >= config.jumpAfter) {
      return {
        action: { kind: "jump" },
        state: { ...state, noProgressSamples, recent, wedgeResets },
      };
    }

    return {
      action: { kind: "walk" },
      state: { ...state, noProgressSamples, recent, wedgeResets },
    };
  }

  // Moving freely - drift onto a new heading now and then so the walk doesn't
  // read as a straight line
  const samplesOnHeading = state.samplesOnHeading + 1;
  if (samplesOnHeading >= config.headingHoldSamples) {
    const heading = drift();
    return {
      action: { kind: "turn", heading, reason: "drift" },
      state: {
        heading,
        noProgressSamples: 0,
        samplesOnHeading: 0,
        recent,
        wedgeResets,
      },
    };
  }

  return {
    action: { kind: "walk" },
    state: { ...state, noProgressSamples: 0, samplesOnHeading, recent, wedgeResets },
  };
};
