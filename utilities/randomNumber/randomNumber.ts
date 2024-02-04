import seedrandom from "seedrandom";

/**
 * Utility function to generate a random number
 * @param seed The seed used to generate a random number
 * @param min The minimum number in the random range
 * @param max The maximum number in the random range
 * @param interger Whether or not to return an integer or a decimal
 * @returns A random number
 */
export const randomNumber = (
  seed?: number | string,
  min?: number,
  max?: number,
  integer?: boolean
) => {
  const rng = seedrandom(seed ?? Math.random());
  const maxNum = max ?? 1;
  const minNum = min ?? 0;
  let number = rng() * (maxNum - minNum) + minNum;

  if (integer) {
    number = Math.round(number);
  }

  console.log("Random Number:", { maxNum, minNum, integer, number });

  return number;
};
