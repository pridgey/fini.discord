import { beforeEach, describe, expect, it } from "bun:test";
import { getCapabilityDigest } from "../../modules/help/capabilityDigest";
import { resetCommandIndex } from "../../modules/help/commandIndex";

describe("getCapabilityDigest", () => {
  beforeEach(() => {
    resetCommandIndex();
  });

  it("lists real commands under their categories", async () => {
    const digest = await getCapabilityDigest();

    expect(digest).toContain("/balance");
    expect(digest).toContain("/finicard-v2");
    expect(digest).toContain("Finicards:");
  });

  it("states that the list is complete", async () => {
    // The failure mode is confabulation, not ignorance - a model that knows
    // six real commands will invent a seventh unless told the list is closed.
    const digest = await getCapabilityDigest();

    expect(digest.toLowerCase()).toContain("complete");
  });

  it('mentions the "hey fini" trigger, which is not a slash command', async () => {
    expect(await getCapabilityDigest()).toContain("hey fini");
  });

  it("names a command's subcommands", async () => {
    const digest = await getCapabilityDigest("finicard");

    expect(digest).toContain("subcommands:");
    expect(digest).toContain("pack");
  });

  it("summarises the tail of a long subcommand list", async () => {
    // /finicard-v2 has well over the cap; the rest must be counted, not cut.
    expect(await getCapabilityDigest("finicard-v2")).toMatch(/\+\d+ more/);
  });

  it("narrows to a topic", async () => {
    const cards = await getCapabilityDigest("card");

    expect(cards).toContain("/booster-pack");
    expect(cards).not.toContain("/weather");
  });

  it("falls back to everything when a topic matches nothing", async () => {
    // An empty digest would be read as "Fini has no commands".
    const digest = await getCapabilityDigest("zzzz-no-such-thing");

    expect(digest).toContain("/balance");
    expect(digest).toContain("/weather");
  });

  it("stays small enough to feed back to the local model", async () => {
    // MAX_TOOL_RESULT_CHARS in llamaTools.ts is 6000; past that the tool
    // result is truncated mid-sentence.
    expect((await getCapabilityDigest()).length).toBeLessThan(6000);
  });
});
