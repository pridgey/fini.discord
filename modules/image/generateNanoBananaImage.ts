import Replicate from "replicate";
import { ImageGenerationParams, ImageGenerationResult } from "./types";

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

    const respond: any = await replicate.run("google/nano-banana", {
      input: {
        prompt,
        image_input: imageInput ? [imageInput] : undefined,
      },
    });

    return {
      imageUrl: respond || "",
      success: true,
    };
  } catch (err: unknown) {
    return {
      imageUrl: "",
      success: false,
      error: (err as Error).message,
    };
  }
};
