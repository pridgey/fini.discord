import seedrandom from "seedrandom";

// Initialize the random number object
const rng = seedrandom(Date.now());

/**
 * Utility function to generate a random number
 * @param min The minimum number in the random range
 * @param max The maximum number in the random range
 * @param interger Whether or not to return an integer or a decimal
 * @returns A random number
 */
export const randomNumber = (min?: number, max?: number, integer?: boolean) => {
  const maxNum = max ?? 1;
  const minNum = min ?? 0;
  let number = rng() * (maxNum - minNum) + minNum;

  if (integer) {
    number = Math.round(number);
  }

  return number;
};
