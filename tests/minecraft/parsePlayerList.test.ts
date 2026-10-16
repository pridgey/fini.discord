import { describe, expect, it } from "bun:test";
import {
  countHumanPlayers,
  parsePlayerList,
} from "../../modules/minecraft/parsePlayerList";

// Every string below is a verbatim `list` response from this server
const EMPTY = "There are 0 of a max of 20 players online:";
const ONE_HUMAN = "There are 1 of a max of 20 players online: [334] Pridgey";
const HUMAN_AND_BOT =
  "There are 2 of a max of 20 players online: [334] Pridgey, [0] FINI";
const BOT_ONLY = "There are 1 of a max of 20 players online: [0] FINI";

const BOTS = ["Fini"];

describe("parsePlayerList", () => {
  it("reads an empty server", () => {
    expect(parsePlayerList(EMPTY)).toEqual({ total: 0, names: [] });
  });

  // The bracketed number comes from a mod, not vanilla, so it is stripped
  it("strips the mod-added bracket prefix from names", () => {
    expect(parsePlayerList(HUMAN_AND_BOT)).toEqual({
      total: 2,
      names: ["Pridgey", "FINI"],
    });
  });

  it("returns null for a response it cannot read", () => {
    expect(parsePlayerList("Unknown command")).toBeNull();
  });
});

describe("countHumanPlayers", () => {
  it("counts nobody on an empty server", () => {
    expect(countHumanPlayers(EMPTY, BOTS)).toBe(0);
  });

  it("counts a real player", () => {
    expect(countHumanPlayers(ONE_HUMAN, BOTS)).toBe(1);
  });

  /*
   * The case the whole module exists for: Fini wandering on an otherwise empty
   * server must read as empty, or the 15 minute shutdown never fires again.
   */
  it("does not count a lone bot as a player", () => {
    expect(countHumanPlayers(BOT_ONLY, BOTS)).toBe(0);
  });

  it("counts only the human when a bot is also online", () => {
    expect(countHumanPlayers(HUMAN_AND_BOT, BOTS)).toBe(1);
  });

  // The server reports the canonical casing (FINI), which won't match .env
  it("matches bot names case-insensitively", () => {
    expect(countHumanPlayers(BOT_ONLY, ["fini"])).toBe(0);
    expect(countHumanPlayers(BOT_ONLY, ["FiNi"])).toBe(0);
  });

  it("reports unknown rather than empty when the response is unreadable", () => {
    expect(countHumanPlayers("garbage", BOTS)).toBeNull();
  });

  /*
   * Errs towards keeping the server up. A missed shutdown wastes power; a
   * wrong one drops people out of the world mid-session.
   */
  it("falls back to the reported total when names cannot be recovered", () => {
    expect(
      countHumanPlayers("There are 3 of a max of 20 players online", BOTS),
    ).toBe(3);
  });

  it("counts every human when no bots are configured", () => {
    expect(countHumanPlayers(HUMAN_AND_BOT, [])).toBe(2);
  });
});
