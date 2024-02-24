/**
 * Breaks large strings into an array of smaller strings -- helpful for things like Discord with max message sizes
 * @param str The string to split into multiple strings
 * @param maxLength The max length of any given string
 * @returns array of smaller strings
 */
export const splitBigString = (str: string, maxLength: number = 1990): string[] => {
  if (str.length <= maxLength) {
    return [str];
  }

  const markdownRegexes: RegExp[] = [
    /\*\*[^]*?\*\*/,      // Bold markdown
    /\*[^]*?\*/,          // Single star
    /_[^]*?_/,            // Italic markdown
    /__[^]*?__/,          // Double underscore
    /`[^]*?`/,            // Inline code markdown
    /```[^]*?```/,        // Code block markdown
  ];

  let breakIndex = maxLength;

  // Find the nearest sentence terminator before the breakIndex
  for (let i = maxLength; i >= 0; i--) {
    const char = str[i];
    if (char === '.' || char === '?' || char === '\n') {
      breakIndex = i;
      break;
    }
  }

  // Check for markdown matches before the breakIndex
  for (const regex of markdownRegexes) {
    const match = regex.exec(str.slice(0, breakIndex + 1));
    if (match && match.index !== undefined) {
      if (regex.source === '```') { // If the match is a code block
        breakIndex = match.index + 6;
      } else {
        breakIndex = match.index + 2;
      }
      break;
    }
  }

  return [str.slice(0, breakIndex), ...splitBigString(str.slice(breakIndex).trim(), maxLength)];
};
