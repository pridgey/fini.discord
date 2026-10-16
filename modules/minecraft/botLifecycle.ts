/**
 * When Fini's bot should exist.
 *
 * The constraint that shapes this: the bot must never be the reason the server
 * stays up. The monitor excludes bot names from its player count, so an empty
 * server still shuts down on schedule - which also means the bot is killed
 * along with it and nothing brings it back on its own.
 *
 * So it follows people. It appears when someone is playing and goes away when
 * the last of them leaves, rather than wandering an empty world for the
 * fifteen minutes before the shutdown fires, loading chunks nobody is looking
 * at.
 */

export type LifecycleAction = "spawn" | "despawn" | "none";

export const decideLifecycle = (args: {
  /** Null when the player list couldn't be read. */
  humansOnline: number | null;
  botOnline: boolean;
}): LifecycleAction => {
  const { humansOnline, botOnline } = args;

  // Unknown is not "nobody" - acting on a failed read would thrash the bot
  if (humansOnline === null) return "none";

  if (humansOnline > 0 && !botOnline) return "spawn";
  if (humansOnline === 0 && botOnline) return "despawn";
  return "none";
};
