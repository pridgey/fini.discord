import type { ImageGenerationResult } from "./types";

/**
 * The image link in what a Replicate model returned. Models differ: some
 * return a list of links, some one link, and newer clients wrap a link in an
 * object with a `url()`. Undefined when there's none of those.
 */
export const replicateImageUrl = (output: unknown): string | undefined => {
  const first = Array.isArray(output) ? output[0] : output;
  if (typeof first === "string") return first || undefined;
  if (first && typeof (first as { url?: unknown }).url === "function") {
    return String((first as { url: () => unknown }).url());
  }
  return undefined;
};

/** A generator's result from a Replicate model's output: its image, or why there isn't one. */
export const fromReplicateOutput = (output: unknown): ImageGenerationResult => {
  const image = replicateImageUrl(output);
  return image
    ? { image, success: true }
    : { image: "", success: false, error: "The model didn't return an image." };
};
