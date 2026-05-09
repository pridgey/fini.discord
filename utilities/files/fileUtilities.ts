import { access } from "fs/promises";

/**
 * Simple utility function to determine if a file actually exists
 * @param path The path to the file you want to check for existence
 * @returns true if the file exists, false if it doesn't
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
