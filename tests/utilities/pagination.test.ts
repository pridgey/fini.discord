import { describe, expect, it } from "bun:test";
import { stepPage } from "../../utilities/pagination/pagination";

/**
 * `stepPage` is the half of the pagination buttons that doesn't touch the
 * database, which is exactly the half that had a bug: `prev_page` never passed
 * `wrap` through, so a wrapping context kept Previous disabled on page 1.
 */
describe("stepPage", () => {
  it("steps forward and back", () => {
    expect(stepPage(2, 1, { totalPages: 5 })).toBe(3);
    expect(stepPage(2, -1, { totalPages: 5 })).toBe(1);
  });

  it("clamps at the ends without wrap", () => {
    expect(stepPage(1, -1, { totalPages: 5 })).toBe(1);
    expect(stepPage(5, 1, { totalPages: 5 })).toBe(5);
  });

  it("wraps both ways when the context says to", () => {
    expect(stepPage(1, -1, { totalPages: 5, wrap: true })).toBe(5);
    expect(stepPage(5, 1, { totalPages: 5, wrap: true })).toBe(1);
  });

  it("clamps rather than guessing when the page count isn't known yet", () => {
    // Only `total_pages_override` is readable before running the query, so a
    // wrapping context without one has nothing to wrap backwards onto.
    expect(stepPage(1, -1, { wrap: true })).toBe(1);
  });

  it("steps forward freely when the page count isn't known", () => {
    // The query clamps the far end; the button is disabled there anyway.
    expect(stepPage(3, 1, {})).toBe(4);
  });

  it("defaults to no wrap and no known total", () => {
    expect(stepPage(1, -1)).toBe(1);
    expect(stepPage(1, 1)).toBe(2);
  });

  it("recovers from a stale page past a shrunken result set", () => {
    expect(stepPage(9, 1, { totalPages: 3 })).toBe(3);
    expect(stepPage(9, 1, { totalPages: 3, wrap: true })).toBe(1);
  });
});
