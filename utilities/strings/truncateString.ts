/**
 * Utility function to truncate a string to a specified length, adding an ellipsis if it exceeds that length.
 * @param str The string to be truncated
 * @param maxLength The max length of the string
 * @returns The truncated string with an ellipsis if it exceeds the max length, otherwise the original string
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "…";
}
