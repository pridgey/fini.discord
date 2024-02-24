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
    /_[^]*?_/,            // Italic markdown
    /`[^]*?`/,            // Inline code markdown
    /```[^]*?```/,        // Code block markdown
    /\n/                  // Newline character
  ];

  let breakIndex = maxLength;
  for (const regex of markdownRegexes) {
    const match = regex.exec(str.slice(0, maxLength + 1));
    if (match && match.index !== undefined) {
      if (regex.source === '\n') { // If the match is a newline character
        breakIndex = match.index;
        break;
      }
      breakIndex = match.index + (regex.source === '```' ? 6 : 2);
      break;
    }
  }

  // Find the nearest space character before the breakIndex
  const spaceIndex = str.lastIndexOf(' ', breakIndex);
  const splitIndex = spaceIndex !== -1 ? spaceIndex : breakIndex;

  return [str.slice(0, splitIndex), ...splitBigString(str.slice(splitIndex), maxLength)];
};
