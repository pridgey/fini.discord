import { beforeEach, describe, expect, it } from "bun:test";
import {
  CATEGORY_ORDER,
  COMMAND_CATEGORIES,
  UNCATEGORISED,
  findCommand,
  getCommandIndex,
  getHelpCategories,
  resetCommandIndex,
} from "../../modules/help/commandIndex";

/**
 * These run against the real command files rather than a fixture, on purpose.
 * The whole point of the index is that it cannot drift from what is registered,
 * and a mocked loader would test the mock.
 */

describe("getCommandIndex", () => {
  beforeEach(() => {
    resetCommandIndex();
  });

  it("finds every command file", async () => {
    const commands = await getCommandIndex();

    // Sanity floor rather than an exact count, which would fail on every new
    // command for no useful reason.
    expect(commands.length).toBeGreaterThan(40);
    expect(commands.map((c) => c.name)).toContain("balance");
    expect(commands.map((c) => c.name)).toContain("help");
  });

  it("reads descriptions from the builder, not the source text", async () => {
    const commands = await getCommandIndex();

    /*
     * /anistock declares an option before its own description, so anything
     * scraping the first `setDescription` in the file gets the option's text
     * ("The field to sort results by") instead of the command's. This is the
     * regression that justifies going through `data.toJSON()`.
     */
    const anistock = commands.find((c) => c.name === "anistock");

    expect(anistock).toBeDefined();
    expect(anistock?.description).not.toBe("The field to sort results by");
    expect(anistock?.description.length).toBeGreaterThan(0);
  });

  it("flattens subcommand groups into typeable names", async () => {
    const finicard = await findCommand("finicard-v2");
    const names = finicard?.subcommands.map((s) => s.name) ?? [];

    // Flat subcommand and a grouped one, both as the user would type them.
    expect(names).toContain("pack");
    expect(names).toContain("deck build");
    expect(names).not.toContain("build");
  });

  it("captures options on a subcommand", async () => {
    const finicard = await findCommand("finicard-v2");
    const build = finicard?.subcommands.find((s) => s.name === "deck build");

    expect(build?.options.map((o) => o.name)).toContain("name");
    expect(build?.options.find((o) => o.name === "name")?.required).toBe(true);
    expect(build?.options.find((o) => o.name === "size")?.required).toBe(false);
  });

  it("captures top-level options when there are no subcommands", async () => {
    const give = await findCommand("give");

    expect(give?.subcommands).toHaveLength(0);
    expect(give?.options.length).toBeGreaterThan(0);
  });

  it("drops the collection page option from /finicard-v2", async () => {
    // Pagination buttons replaced it; a stale `page:` would be registered with
    // Discord and silently ignored.
    const finicard = await findCommand("finicard-v2");
    const collection = finicard?.subcommands.find(
      (s) => s.name === "collection",
    );

    expect(collection?.options.map((o) => o.name)).toEqual(["who"]);
  });

  it("accepts a leading slash when looking a command up", async () => {
    expect((await findCommand("/balance"))?.name).toBe("balance");
    expect((await findCommand("BALANCE"))?.name).toBe("balance");
    expect(await findCommand("not-a-command")).toBeNull();
  });
});

describe("categories", () => {
  beforeEach(() => {
    resetCommandIndex();
  });

  it("categorises every command", async () => {
    const commands = await getCommandIndex();
    const uncategorised = commands
      .filter((c) => c.category === UNCATEGORISED)
      .map((c) => c.name);

    // Fails loudly when a new command is added without a category, which is
    // the whole reason this bucket exists.
    expect(uncategorised).toEqual([]);
  });

  it("only maps categories that are in the display order", () => {
    const unknown = Object.values(COMMAND_CATEGORIES).filter(
      (category) => !CATEGORY_ORDER.includes(category),
    );

    expect([...new Set(unknown)]).toEqual([]);
  });

  it("does not map commands that no longer exist", async () => {
    const commands = await getCommandIndex();
    const names = new Set(commands.map((c) => c.name));

    const stale = Object.keys(COMMAND_CATEGORIES).filter(
      (name) => !names.has(name),
    );

    expect(stale).toEqual([]);
  });

  it("groups into non-empty categories in display order", async () => {
    const categories = await getHelpCategories();

    expect(categories.length).toBeGreaterThan(1);
    for (const category of categories) {
      expect(category.commands.length).toBeGreaterThan(0);
    }

    const positions = categories.map((c) => CATEGORY_ORDER.indexOf(c.name));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("puts every command in exactly one category", async () => {
    const commands = await getCommandIndex();
    const categories = await getHelpCategories();

    const grouped = categories.flatMap((c) => c.commands.map((x) => x.name));

    expect(grouped.length).toBe(commands.length);
    expect(new Set(grouped).size).toBe(commands.length);
  });
});
