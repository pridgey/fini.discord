import OpenAI from "openai";
import type { OpenAIError } from "openai/error";
import { ImageGenerationParams, ImageGenerationResult } from "./types";

export const DALLE_COST = 10;

/**
 * Generate an image using DALL-E 3
 */
export const generateDalleImage = async ({
  prompt,
}: ImageGenerationParams): Promise<ImageGenerationResult> => {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "no_key_found",
    });

    const respond = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
    });

    return {
      imageUrl: respond.data[0].url || "",
      success: true,
    };
  } catch (err: unknown) {
    return {
      imageUrl: "",
      success: false,
      error: (err as OpenAIError).message,
    };
  }
};
