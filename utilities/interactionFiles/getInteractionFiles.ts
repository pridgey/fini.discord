import { glob } from "glob";
import path from "path";
import {
  isButtonHandler,
  isModalHandler,
  isSlashCommand,
  type ButtonHandler,
  type ModalHandler,
  type SlashCommand,
} from "../../types/handlers";

/** The repo root: the folders below are read from here, wherever the bot was started. */
const ROOT = path.resolve(import.meta.dir, "..", "..");

/**
 * Imports every file matching `pattern` and keeps those with the right
 * exports. A file without them is reported, not loaded - one broken file
 * shouldn't take every other command down with it.
 */
const loadFiles = async <T>(
  pattern: string,
  isValid: (file: unknown) => file is T,
  kind: string,
): Promise<{ files: string[]; handlers: T[] }> => {
  const files = (await glob(pattern, { cwd: ROOT })).sort();
  const handlers: T[] = [];
  for (const file of files) {
    const loaded: unknown = await import(path.join(ROOT, file));
    if (isValid(loaded)) handlers.push(loaded);
    else
      console.error(
        `⚠️ ${file} isn't a valid ${kind}: its exports don't match. Skipped.`,
      );
  }
  return { files, handlers };
};

let commandsPromise: ReturnType<typeof loadCommands> | null = null;

const loadCommands = () =>
  loadFiles<SlashCommand>(
    "commands/*.command.ts",
    isSlashCommand,
    "slash command",
  );

/**
 * Every slash command. Loaded once and reused: this runs before each slash
 * command is answered, and Discord expires an interaction after three seconds.
 */
export const getCommandFiles = () => {
  commandsPromise ??= loadCommands().catch((error) => {
    commandsPromise = null;
    throw error;
  });
  return commandsPromise;
};

/** Every button handler. */
export const getButtonFiles = () =>
  loadFiles<ButtonHandler>(
    "buttons/individualButtons/*.button.ts",
    isButtonHandler,
    "button handler",
  );

/** Every form (modal) handler. */
export const getModalFiles = () =>
  loadFiles<ModalHandler>(
    "modals/individualModals/*.modal.ts",
    isModalHandler,
    "modal handler",
  );
