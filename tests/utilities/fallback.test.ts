import { describe, expect, it, spyOn } from "bun:test";
import { warnAndUse } from "../../utilities/fallback";

describe("warnAndUse", () => {
  it("logs what failed and hands back the fallback", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});

    const result = await Promise.reject(new Error("renderer down")).catch(
      warnAndUse("text face", "draw the card"),
    );

    expect(result).toBe("text face");
    expect(warn).toHaveBeenCalledWith(
      "Couldn't draw the card; using the fallback:",
      expect.any(Error),
    );
    warn.mockRestore();
  });
});
