/**
 * Helper function to determine the file type for Anthropic API based on mime type
 * @param mimeType
 * @returns
 */
export const determineAnthropicFileType = (mimeType: string) => {
  let fileType: "container_upload" | "image" | "document" = "container_upload";

  // Determine file type for message by mime_type
  if (mimeType.startsWith("image/")) {
    fileType = "image";
  } else if (["application/pdf", "text/plain"].includes(mimeType || "")) {
    fileType = "document";
  }

  return fileType;
};
