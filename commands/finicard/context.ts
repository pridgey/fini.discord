/** What every `/finicard` subcommand is told about where it was run. */
export type FinicardContext = {
  serverId: string;
  serverName: string;
  /** "username-servername", the key packs and decks log under. */
  identifier: string;
};
