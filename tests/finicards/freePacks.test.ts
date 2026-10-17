import { describe, expect, it } from "bun:test";
import {
  freePacksOwed,
  planFreePacks,
  type ItemOwner,
} from "../../modules/finicards/freePacks";

/* Free packs at launch: one per forty item cards lost, and one Secret Art and
   one Legendary per server, placed by hand rather than left to chance. */

const owner = (userId: string, items: number, serverId = "s1"): ItemOwner => ({
  userId,
  serverId,
  identifier: `${userId}-${serverId}`,
  items,
});

describe("free packs owed", () => {
  it("is one per forty items, rounded up, and none for none", () => {
    expect(freePacksOwed(0)).toBe(0);
    expect(freePacksOwed(1)).toBe(1);
    expect(freePacksOwed(40)).toBe(1);
    expect(freePacksOwed(41)).toBe(2);
    expect(freePacksOwed(430)).toBe(11);
  });
});

describe("the launch batch", () => {
  const owners = [
    owner("admin", 430),
    owner("ann", 340),
    owner("bo", 19),
    owner("cy", 5),
  ];

  it("gives everyone the packs they are owed", () => {
    const { packs } = planFreePacks(owners);
    const count = (userId: string) =>
      packs.filter((pack) => pack.userId === userId).length;
    expect([count("admin"), count("ann"), count("bo"), count("cy")]).toEqual([
      11, 9, 1, 1,
    ]);
  });

  it("holds exactly one Secret Art and one Legendary per server, in different packs", () => {
    for (let seed = 0; seed < 50; seed++) {
      let state = seed;
      const random = () => (state = (state * 9301 + 49297) % 233280) / 233280;
      const { packs, unplaced } = planFreePacks(
        [...owners, owner("dee", 90, "s2"), owner("eli", 3, "s2")],
        { random },
      );
      for (const serverId of ["s1", "s2"]) {
        const batch = packs.filter((pack) => pack.serverId === serverId);
        expect(
          batch.filter((pack) => pack.special === "secret_art"),
        ).toHaveLength(1);
        expect(
          batch.filter((pack) => pack.special === "legendary"),
        ).toHaveLength(1);
      }
      expect(unplaced).toEqual([]);
    }
  });

  it("never places either in the excluded player's packs", () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const { packs } = planFreePacks(owners, {
        exclude: "admin",
        random: () => roll,
      });
      const special = packs.filter((pack) => pack.special !== "");
      expect(special).toHaveLength(2);
      expect(special.every((pack) => pack.userId !== "admin")).toBe(true);
    }
  });

  it("favours nobody: every eligible pack can be the one", () => {
    const holders = new Set<string>();
    for (let step = 0; step < 11; step++) {
      const { packs } = planFreePacks(owners, {
        exclude: "admin",
        random: () => step / 11,
      });
      holders.add(packs.find((pack) => pack.special === "secret_art")!.userId);
    }
    expect([...holders].sort()).toEqual(["ann", "bo", "cy"]);
  });

  it("says so when a server has no pack that can take one", () => {
    const { packs, unplaced } = planFreePacks(
      [owner("admin", 100), owner("bo", 5)],
      { exclude: "admin" },
    );
    // One eligible pack: it takes the Secret Art, and the Legendary has nowhere to go.
    expect(
      packs.filter((pack) => pack.special !== "").map((pack) => pack.userId),
    ).toEqual(["bo"]);
    expect(unplaced).toEqual(["s1:legendary"]);
  });
});
