/**
 * A random number from `min` to `max` (default 0 to 1).
 *
 * With `integer`, a whole number where every value from `min` to `max`
 * inclusive is equally likely - a d20 is `randomNumber(1, 20, true)`.
 * Without it, a decimal from `min` up to, but not including, `max`.
 */
export const randomNumber = (min = 0, max = 1, integer = false): number =>
  integer
    ? min + Math.floor(Math.random() * (max - min + 1))
    : min + Math.random() * (max - min);
