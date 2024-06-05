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
  let stringChunk = str.slice(0, maxLength);
  let nextStartIndex = stringChunk.length;

  // The number of instances of "aaa" in the chunk
  const codeBlockCount = (stringChunk.match(/```/g) || []).length;

  // Ensure string chunk is not in-between code block markdown
  if (stringChunk.includes("```") && codeBlockCount % 2 !== 0) {
    // Get second to last instance of code block
    const secondToLastCodeBlockIndex =
      stringChunk.lastIndexOf("```", stringChunk.lastIndexOf("```") - 1) + 3;
    stringChunk = str.slice(0, secondToLastCodeBlockIndex);
    nextStartIndex = secondToLastCodeBlockIndex;
  } else {
    // We are fine on code blocks, make sure we end on a new line
    const lastNewline = stringChunk.lastIndexOf("\n");
    stringChunk = str.slice(0, lastNewline);
    nextStartIndex = lastNewline;
  }

  console.log("Split String", {
    nextStartIndex,
    codeBlockCount,
    stringChunk,
  });

  // Recursively goes through the rest
  const remainingStringChunks: string[] = splitBigString(
    str.slice(nextStartIndex),
    maxLength
  );

  // Returns the chunk and the rest for this iteration of the recursion
  return [stringChunk, ...remainingStringChunks];
};
