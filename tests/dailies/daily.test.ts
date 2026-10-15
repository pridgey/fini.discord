import { describe, expect, it } from "bun:test";
import { currentDay, POST_HOUR } from "../../modules/dailies/geo/daily";
import { dayKey, previousDay } from "../../modules/dailies/geo/dailyStore";

describe("the daily's days", () => {
  it("keys a day by its local date", () => {
    expect(dayKey(new Date(2026, 9, 16, 23, 59))).toBe("2026-10-16");
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("steps back a day across months and years", () => {
    expect(previousDay("2026-10-16")).toBe("2026-10-15");
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
    expect(previousDay("2027-01-01")).toBe("2026-12-31");
  });

  it("keeps a round open until the next one posts", () => {
    expect(currentDay(new Date(2026, 9, 16, POST_HOUR - 1, 59))).toBe("2026-10-15");
    expect(currentDay(new Date(2026, 9, 16, 0, 5))).toBe("2026-10-15");
    expect(currentDay(new Date(2026, 9, 16, POST_HOUR, 0))).toBe("2026-10-16");
    expect(currentDay(new Date(2026, 9, 16, 23, 59))).toBe("2026-10-16");
  });
});
