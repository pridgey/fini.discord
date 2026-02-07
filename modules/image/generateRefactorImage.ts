import Replicate from "replicate";
import { ImageGenerationParams, ImageGenerationResult } from "./types";

export const REFACTOR_COST = 20;

/**
 * Generate an image using Recraft V3
 */
export const generateRefactorImage = async ({
  prompt,
}: ImageGenerationParams): Promise<ImageGenerationResult> => {
  try {
    const replicate = new Replicate();

    const respond: any = await replicate.run("recraft-ai/recraft-v3", {
      input: {
        size: "1365x1024",
        prompt,
        disable_safety_checker: true,
        safety_tolerance: 5,
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
