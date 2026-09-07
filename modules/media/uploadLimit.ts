/**
 * How large a file this guild will accept.
 *
 * discord.js exposes the boost tier but not the upload ceiling it implies, so
 * the mapping lives here. Getting it wrong is expensive in a way that is easy
 * to miss: the upload only fails after the whole file has been sent, which on
 * a 100MB guess against a 10MB guild means minutes of transfer and then a
 * 40005 the user reads as the command being broken.
 */

/** Boost tiers, matching discord.js's `GuildPremiumTier`. */
const TIER_LIMITS_MIB: Record<number, number> = {
  0: 10,
  1: 10,
  2: 50,
  3: 100,
};

const MIB = 1024 * 1024;

/** What an unboosted guild allows, and the fallback outside a guild. */
export const DEFAULT_UPLOAD_LIMIT_BYTES = 10 * MIB;

/**
 * Headroom held back when re-encoding to fit.
 *
 * A bitrate target is an average, and the muxer adds an index and per-packet
 * overhead on top, so a file encoded to land exactly on the limit lands just
 * over it often enough to matter. Cutting the target keeps the second attempt
 * rare.
 */
const FIT_MARGIN_BYTES = 512 * 1024;

/**
 * The upload ceiling for a guild.
 * @param premiumTier The guild's boost tier, or undefined outside a guild
 * @returns The ceiling in bytes
 */
export const uploadLimitBytes = (premiumTier?: number): number => {
  const mib =
    premiumTier === undefined ? undefined : TIER_LIMITS_MIB[premiumTier];

  return mib === undefined ? DEFAULT_UPLOAD_LIMIT_BYTES : mib * MIB;
};

/**
 * The size to aim an encode at, given the ceiling.
 * @param limitBytes The guild's ceiling from `uploadLimitBytes`
 * @returns A target below the ceiling, never less than half of it
 */
export const fitTargetBytes = (limitBytes: number): number =>
  Math.max(limitBytes - FIT_MARGIN_BYTES, Math.floor(limitBytes / 2));

/**
 * Formats a byte count for a Discord reply.
 * @param bytes The size to format
 * @returns A short human-readable size, e.g. `12.4MB`
 */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < MIB) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / MIB).toFixed(1)}MB`;
};
