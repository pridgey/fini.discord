import { describe, expect, it } from "bun:test";
import {
  fromReplicateOutput,
  replicateImageUrl,
} from "../../modules/image/replicateOutput";

describe("Replicate image output", () => {
  it("reads a list of links, one link, or a link wrapped in an object", () => {
    expect(replicateImageUrl(["https://a/1.png", "https://a/2.png"])).toBe(
      "https://a/1.png",
    );
    expect(replicateImageUrl("https://a/1.png")).toBe("https://a/1.png");
    expect(replicateImageUrl([{ url: () => new URL("https://a/1.png") }])).toBe(
      "https://a/1.png",
    );
  });

  it("reports a failure, not an empty image, when there's no link", () => {
    for (const output of [[], "", null, { status: "failed" }]) {
      expect(fromReplicateOutput(output)).toEqual({
        image: "",
        success: false,
        error: "The model didn't return an image.",
      });
    }
  });
});
