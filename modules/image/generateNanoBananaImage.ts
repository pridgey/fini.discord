import Replicate from "replicate";
import { ImageGenerationParams, ImageGenerationResult } from "./types";
import { fromReplicateOutput } from "./replicateOutput";

export const NANO_BANANA_COST = 30;

/**
 * Generate an image using Google's Nano-Banana
 */
export const generateNanoBananaImage = async ({
  prompt,
  imageInput,
}: ImageGenerationParams): Promise<ImageGenerationResult> => {
  try {
    const replicate = new Replicate();

    const output = await replicate.run("google/nano-banana", {
      input: {
        prompt,
        image_input: imageInput ? [imageInput] : undefined,
      },
    });

    return fromReplicateOutput(output);
  } catch (err: unknown) {
    return {
      image: "",
      success: false,
      error: (err as Error).message,
    };
  }
};
