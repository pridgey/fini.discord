/* Takes a large string and splits it into an array of chunks
param str - string - the string to split apart
param addEllipsis - boolean - whether or not to append a "..." at the end of each chunk, defaults false
param maxLength - number - what size to split each chunk to, defaults 1990
*/
export const splitBigString = (
  str: string,
  addEllipsis: boolean = false,
  maxLength: number = 1990
): string[] => {
  // If less than max amount, simply return
  if (str.length <= maxLength) {
    return [str];
  }

  // otherwise let's recursively go through this shiz
  const stringChunk = `${str.slice(0, maxLength)}${addEllipsis ? "..." : ""}`;
  const remainingString = splitBigString(
    str.slice(maxLength),
    addEllipsis,
    maxLength
  );
  return [stringChunk, ...remainingString];
};
