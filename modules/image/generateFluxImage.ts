import Replicate from "replicate";
import { ImageGenerationParams, ImageGenerationResult } from "./types";

export const FLUX_COST = 0;

/**
 * Generate an image using Flux-Schnell
 */
export const generateFluxImage = async ({
  prompt,
}: ImageGenerationParams): Promise<ImageGenerationResult> => {
  try {
    const replicate = new Replicate();

    const respond: any = await replicate.run("black-forest-labs/flux-schnell", {
      input: {
        prompt,
        disable_safety_checker: true,
        safety_tolerance: 5,
      },
    });

    return {
      imageUrl: respond[0] || "",
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
