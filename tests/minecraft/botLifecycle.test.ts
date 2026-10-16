import { describe, expect, it } from "bun:test";
import { decideLifecycle } from "../../modules/minecraft/botLifecycle";

describe("decideLifecycle", () => {
  it("spawns the bot once somebody is playing", () => {
    expect(decideLifecycle({ humansOnline: 1, botOnline: false })).toBe("spawn");
  });

  it("leaves it alone when it is already there", () => {
    expect(decideLifecycle({ humansOnline: 2, botOnline: true })).toBe("none");
  });

  /*
   * Not just tidiness: left alone on an empty server it would wander for the
   * fifteen minutes before the shutdown, generating chunks nobody is looking
   * at.
   */
  it("despawns it when the last person leaves", () => {
    expect(decideLifecycle({ humansOnline: 0, botOnline: true })).toBe(
      "despawn",
    );
  });

  it("does not spawn it onto an empty server", () => {
    expect(decideLifecycle({ humansOnline: 0, botOnline: false })).toBe("none");
  });

  // A failed player-list read must not be mistaken for an empty server
  it("does nothing when the player count is unknown", () => {
    expect(decideLifecycle({ humansOnline: null, botOnline: true })).toBe(
      "none",
    );
    expect(decideLifecycle({ humansOnline: null, botOnline: false })).toBe(
      "none",
    );
  });
});
