export type ImageGenerationResult = {
  /** A link to the image, or the image itself. */
  image: string | Buffer;
  success: boolean;
  error?: string;
};

export type ImageGenerationParams = {
  prompt: string;
  imageInput?: string;
};

export const MAX_PROMPT_LENGTH = 1000;
