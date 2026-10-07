import { beforeEach, describe, expect, it } from "bun:test";
import { helpCategoriesQuery } from "../../queries/queryFunctions/helpCategories.query";
import {
  getHelpCategories,
  resetCommandIndex,
} from "../../modules/help/commandIndex";

const render = (components: any[]): string =>
  JSON.stringify(components[0].toJSON());

describe("helpCategoriesQuery", () => {
  beforeEach(() => {
    resetCommandIndex();
  });

  it("is registered under the id the pagination context stores", () => {
    expect(helpCategoriesQuery.id).toBe("help_commands");
  });

  it("serves one category per page", async () => {
    const categories = await getHelpCategories();
    const result = await helpCategoriesQuery.query({ page: 1, perPage: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.totalPages).toBe(categories.length);
    expect(result.currentPage).toBe(1);
    expect(result.items[0].name).toBe(categories[0].name);
  });

  it("walks to a later page", async () => {
    const categories = await getHelpCategories();
    const result = await helpCategoriesQuery.query({ page: 3, perPage: 1 });

    expect(result.items[0].name).toBe(categories[2].name);
    expect(result.currentPage).toBe(3);
  });

  it("clamps a page beyond the end rather than returning nothing", async () => {
    // A stale message can deliver a click after the index changed shape.
    const result = await helpCategoriesQuery.query({ page: 999, perPage: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.currentPage).toBe(result.totalPages);
  });

  it("clamps a page below the start", async () => {
    const result = await helpCategoriesQuery.query({ page: 0, perPage: 1 });

    expect(result.currentPage).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it("renders the category's commands as Components V2", async () => {
    const categories = await getHelpCategories();
    const finicards = categories.find((c) => c.name === "Finicards");

    const { components, useComponentsV2 } =
      await helpCategoriesQuery.buildResults({ items: [finicards!] });

    expect(useComponentsV2).toBe(true);

    const text = render(components!);
    expect(text).toContain("Finicards");
    expect(text).toContain("/booster-pack");
    expect(text).toContain("/help command:");
  });

  it("names a command's subcommands on the category page", async () => {
    const categories = await getHelpCategories();
    const finicards = categories.find((c) => c.name === "Finicards");

    const { components } = await helpCategoriesQuery.buildResults({
      items: [finicards!],
    });

    expect(render(components!)).toContain("pack");
  });

  it("renders something rather than throwing on an empty page", async () => {
    const { components } = await helpCategoriesQuery.buildResults({
      items: [],
    });

    expect(render(components!)).toContain("Fini Help");
  });
});
