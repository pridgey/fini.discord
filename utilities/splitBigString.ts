function splitString(input: string, maxLength: number): string[] {
  // If the input string is smaller than the max length, return an array with the input string
  if (input.length <= maxLength) {
    return [input];
  }

  // Regular expressions to identify sentence endings, list items, markdown formatting, and code blocks
  const sentenceEndingRegex = /(\.|\?|!)\s/;
  const listItemRegex = /- \s/;
  const markdownFormattingRegex = /(`{1,3}|\*{1,3}|_{1,3})/;
  const codeBlockRegex = /```/;

  let result: string[] = [];
  let currentString = '';
  const words = input.split(' ');

  for (const word of words) {
    // If adding the current word would exceed the max length
    if (currentString.length + word.length + 1 > maxLength) {
      // If the current string is not empty, add it to the result array
      if (currentString.length > 0) {
        result.push(currentString);
      }
      // Start a new string with the current word
      currentString = word;
    } else {
      // Otherwise, add the word to the current string
      currentString += ' ' + word;
    }
  }

  // Add the last string to the result array if it's not empty
  if (currentString.length > 0) {
    result.push(currentString);
  }

  // Ensure no part of the string is in the middle of a sentence, list item, markdown formatting, or code block
  result = result.map(part => {
    if (sentenceEndingRegex.test(part) || listItemRegex.test(part) || markdownFormattingRegex.test(part) || codeBlockRegex.test(part)) {
      // Find the last occurrence of a sentence ending, list item, markdown formatting, or code block in the part
      const index = Math.max(
        part.lastIndexOf('.'),
        part.lastIndexOf('?'),
        part.lastIndexOf('!'),
        part.lastIndexOf('- '),
        part.lastIndexOf(' ')
      );
      // Split the part at the last occurrence
      return part.slice(0, index + 2);
    }
    return part;
  });

  return result;
}
