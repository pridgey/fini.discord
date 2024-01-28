import seedrandom from "seedrandom";

/**
 * Utility function to generate a random number
 * @param seed The seed used to generate a random number
 * @param min The minimum number in the random range
 * @param max The maximum number in the random range
 * @returns A random number
 */
export const randomNumber = (
  seed?: number | string,
  min?: number,
  max?: number
) => {
  const rng = seedrandom(seed ?? Math.random());
  const maxNum = max ?? 1;
  const minNum = min ?? 0;

  return rng() * (maxNum - minNum) + minNum;
};
