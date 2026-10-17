/**
 * A `.catch` handler for work that has a fallback: it logs what failed, then
 * hands back `fallback` so the caller carries on with it.
 *
 *   const art = await renderArt(card).catch(warnAndUse(null, "render the card art"));
 *
 * Without the log, a broken renderer or an unreachable service would only ever
 * show up as the fallback, and nobody would know to look.
 */
export const warnAndUse =
  <T>(fallback: T, what: string) =>
  (error: unknown): T => {
    console.warn(`Couldn't ${what}; using the fallback:`, error);
    return fallback;
  };
