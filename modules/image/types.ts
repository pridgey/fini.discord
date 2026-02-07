export type ImageGenerationResult = {
  imageUrl: string;
  success: boolean;
  error?: string;
};

export type ImageGenerationParams = {
  prompt: string;
  imageInput?: string;
};

export const MAX_PROMPT_LENGTH = 1000;
