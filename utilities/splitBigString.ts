/**
 * Breaks large strings into an array of smaller strings -- helpful for things like Discord with max message sizes
 * @param str The string to split into multiple strings
 * @param addEllipsis Whether or not to add a trailing ellipsis to the prior strings
 * @param maxLength The max length of any given string
 * @returns array of smaller strings
 */
export const splitBigString = (
  str: string,
  maxLength: number = 1990
): string[] => {
  // If less than max amount, simply return
  if (str.length <= maxLength) {
    return [str];
  }

  // Gets a chunk of string
  const stringChunk = str.slice(0, maxLength);

  // Recursively goes through the rest
  const remainingString = splitBigString(str.slice(maxLength), maxLength);
  return [stringChunk, ...remainingString];
};
