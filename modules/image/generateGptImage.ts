import { ImageGenerationParams, ImageGenerationResult } from "./types";

export const GPT_IMAGE_COST = 10;

/**
 * Generate an image using OpenAI's GPT Image 2. It replaced DALL-E 3, which
 * OpenAI shut down in May 2026. Medium quality costs about what DALL-E 3 did.
 * The image comes back as base64, not a link.
 */
export const generateGptImage = async ({
  prompt,
}: ImageGenerationParams): Promise<ImageGenerationResult> => {
  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || "no_key_found"}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "medium",
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const body = (await response.json()) as {
      data?: { b64_json?: string }[];
      error?: { message?: string };
    };
    const base64 = body.data?.[0]?.b64_json;
    if (!response.ok || !base64) {
      throw new Error(body.error?.message ?? `OpenAI returned ${response.status}`);
    }

    return {
      image: Buffer.from(base64, "base64"),
      success: true,
    };
  } catch (err: unknown) {
    return {
      image: "",
      success: false,
      error: (err as Error).message,
    };
  }
};
