import { getCommandFiles } from "../../utilities/interactionFiles/getInteractionFiles";

/**
 * One index of every slash command, built from the command files themselves.
 *
 * Deliberately derived rather than hand-written. A second list of "what Fini
 * can do" would be wrong within a week - `/feature-roadmap` is already a
 * hand-maintained list that has drifted from reality - so this reads the same
 * `data` builders that get registered with Discord. A command that exists is in
 * here; one that doesn't, isn't.
 *
 * Both consumers share it: `/help` renders it, and the AI chat backends answer
 * "what can you do?" from it (see `./capabilityDigest`).
 */

/** Discord's application command option type ids, for the two we branch on. */
const SUBCOMMAND = 1;
const SUBCOMMAND_GROUP = 2;

export type HelpOption = {
  name: string;
  description: string;
  required: boolean;
};

export type HelpSubcommand = {
  /** `deck build`, not `build` - this is what a user types. */
  name: string;
  description: string;
  options: HelpOption[];
};

export type HelpCommand = {
  name: string;
  description: string;
  category: string;
  subcommands: HelpSubcommand[];
  /** Only populated when the command has no subcommands. */
  options: HelpOption[];
};

export type HelpCategory = {
  name: string;
  commands: HelpCommand[];
};

/** Commands with no entry here land in {@link UNCATEGORISED}. */
export const UNCATEGORISED = "Other";

/**
 * Which bucket each command belongs to.
 *
 * Kept as one map rather than a field on each of the 44 command files: adding
 * `export const category` to every command would be a lot of edits to make one
 * page render, and the grouping is a presentation decision that reads better
 * when you can see the whole thing at once.
 *
 * `tests/help/commandIndex.test.ts` asserts every command file appears here, so
 * a new command fails the suite rather than quietly turning up under "Other".
 */
export const COMMAND_CATEGORIES: Record<string, string> = {
  // Finicoin & Economy
  balance: "Finicoin & Economy",
  give: "Finicoin & Economy",
  richlist: "Finicoin & Economy",
  jackpot: "Finicoin & Economy",
  reward: "Finicoin & Economy",

  // Games & Gambling
  blackjack: "Games & Gambling",
  evenodd: "Games & Gambling",
  horsey: "Games & Gambling",
  roll: "Games & Gambling",
  deathbattle: "Games & Gambling",
  "geo-test": "Games & Gambling",
  daily: "Games & Gambling",

  // Finicards
  finicard: "Finicards",
  "suggest-card": "Finicards",

  // AniStock
  anistock: "AniStock",

  // AI & Creative
  image: "AI & Creative",
  "music-ai": "AI & Creative",
  tts: "AI & Creative",
  "generate-npc": "AI & Creative",
  timmypoem: "AI & Creative",
  citation: "AI & Creative",
  "chat-config": "AI & Creative",
  clear: "AI & Creative",

  // Personalities
  "create-personality": "Personalities",
  "edit-personality": "Personalities",
  "delete-personality": "Personalities",
  "list-personalities": "Personalities",
  "set-personality": "Personalities",

  // Minecraft
  "minecraft-server": "Minecraft",

  // Monitoring
  monitor: "Monitoring",
  "monitor-check": "Monitoring",
  "monitor-delete": "Monitoring",

  // Utilities
  convert: "Utilities",
  ytdlp: "Utilities",
  remind: "Utilities",
  weather: "Utilities",
  pokemon: "Utilities",
  slap: "Utilities",
  add: "Utilities",
  blame: "Utilities",
  config: "Utilities",

  // Help & Meta
  help: "Help & Meta",
  "feature-roadmap": "Help & Meta",
};

/** The order categories are presented in, roughly most-used first. */
export const CATEGORY_ORDER: string[] = [
  "Finicoin & Economy",
  "Games & Gambling",
  "Finicards",
  "AniStock",
  "AI & Creative",
  "Personalities",
  "Minecraft",
  "Monitoring",
  "Utilities",
  "Help & Meta",
  UNCATEGORISED,
];

/** The subset of Discord's serialised option shape this module reads. */
type RawOption = {
  name: string;
  description: string;
  type: number;
  required?: boolean;
  options?: RawOption[];
};

const toOption = (option: RawOption): HelpOption => ({
  name: option.name,
  description: option.description,
  required: !!option.required,
});

/**
 * Flattens a command's option tree into "things a user can type".
 *
 * A subcommand group nests one level deeper than a bare subcommand, and the
 * distinction doesn't matter to someone reading help - `deck build` is a thing
 * you run either way - so groups are flattened into prefixed names.
 */
const toSubcommands = (options: RawOption[]): HelpSubcommand[] => {
  const subcommands: HelpSubcommand[] = [];

  for (const option of options) {
    if (option.type === SUBCOMMAND) {
      subcommands.push({
        name: option.name,
        description: option.description,
        options: (option.options ?? []).map(toOption),
      });
    } else if (option.type === SUBCOMMAND_GROUP) {
      for (const nested of option.options ?? []) {
        subcommands.push({
          name: `${option.name} ${nested.name}`,
          description: nested.description,
          options: (nested.options ?? []).map(toOption),
        });
      }
    }
  }

  return subcommands;
};

/**
 * Built once per process.
 *
 * `getCommandFiles` re-globs the filesystem on every call, and the runtime
 * calls it on every single interaction already. Caching is safe because a new
 * command needs `bun run register-commands` and a restart before Discord will
 * offer it anyway.
 */
let cached: HelpCommand[] | null = null;

/** Drops the cache. Exported for tests, which build indexes repeatedly. */
export const resetCommandIndex = (): void => {
  cached = null;
};

/**
 * Every registered command, with its subcommands and options.
 * @returns The index, sorted by name
 */
export const getCommandIndex = async (): Promise<HelpCommand[]> => {
  if (cached) return cached;

  const { importedFiles } = await getCommandFiles();

  const commands: HelpCommand[] = [];

  for (const file of importedFiles) {
    // A file without `data` isn't a command; the loader is a glob, not a
    // contract, so this must not throw on whatever turns up.
    if (typeof file?.data?.toJSON !== "function") continue;

    const json = file.data.toJSON() as {
      name: string;
      description?: string;
      options?: RawOption[];
    };

    const options = json.options ?? [];
    const subcommands = toSubcommands(options);

    commands.push({
      name: json.name,
      description: json.description ?? "",
      category: COMMAND_CATEGORIES[json.name] ?? UNCATEGORISED,
      subcommands,
      // A command is either a container for subcommands or a thing with
      // options; Discord does not allow both.
      options: subcommands.length ? [] : options.map(toOption),
    });
  }

  commands.sort((a, b) => a.name.localeCompare(b.name));

  cached = commands;
  return commands;
};

/**
 * The index grouped into the categories `/help` pages through.
 * @returns Non-empty categories, in {@link CATEGORY_ORDER}
 */
export const getHelpCategories = async (): Promise<HelpCategory[]> => {
  const commands = await getCommandIndex();

  const byCategory = new Map<string, HelpCommand[]>();
  for (const command of commands) {
    const bucket = byCategory.get(command.category) ?? [];
    bucket.push(command);
    byCategory.set(command.category, bucket);
  }

  const ordered: HelpCategory[] = [];

  for (const name of CATEGORY_ORDER) {
    const inCategory = byCategory.get(name);
    if (inCategory?.length) ordered.push({ name, commands: inCategory });
    byCategory.delete(name);
  }

  // Anything whose category isn't in CATEGORY_ORDER still has to appear, or a
  // typo in the map would silently hide a command from help.
  for (const [name, inCategory] of byCategory) {
    ordered.push({ name, commands: inCategory });
  }

  return ordered;
};

/**
 * Looks one command up by name.
 * @param name The command name, with or without a leading slash
 * @returns The command, or null if nothing matches
 */
export const findCommand = async (
  name: string,
): Promise<HelpCommand | null> => {
  const wanted = (name ?? "").trim().replace(/^\//, "").toLowerCase();
  const commands = await getCommandIndex();

  return commands.find((command) => command.name === wanted) ?? null;
};
