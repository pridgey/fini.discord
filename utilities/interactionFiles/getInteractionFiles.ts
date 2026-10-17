import { glob } from "glob";

/**
 * Finds all of the command files in the commands directory
 * @returns A list of command files and their imported modules
 */
const loadCommandFiles = async () => {
  // Grab each command from the commands directory
  const commandFiles = await glob("**/commands/*.command.ts");

  // Map files to format the rest registration needs
  const importedFiles = await Promise.all(
    commandFiles.map((file) => import(`./../../${file}`)),
  );

  return { commandFiles, importedFiles };
};

let commandFilesPromise: ReturnType<typeof loadCommandFiles> | null = null;

/* Loaded once and reused. This runs before every slash command is deferred,
   and the glob walks the whole repo: about a second idle, and far longer while
   image rendering has the thread pool busy - long enough for Discord to expire
   the interaction (3s) before the command could answer it. The modules are
   cached by the runtime anyway, so re-globbing never picked up anything new. */
export const getCommandFiles = () => {
  commandFilesPromise ??= loadCommandFiles().catch((error) => {
    commandFilesPromise = null;
    throw error;
  });
  return commandFilesPromise;
};

/**
 * Finds all of the button files in the buttons directory
 * @returns A list of button files and their imported modules
 */
export const getButtonFiles = async () => {
  const buttonFiles = await glob("**/buttons/individualButtons/*.button.ts");

  // Map files to format the rest registration needs
  const importedFiles = await Promise.all(
    buttonFiles.map((file) => import(`./../../${file}`)),
  );

  return { buttonFiles, importedFiles };
};

/**
 * Finds all of the modal files in the modals directory
 * @returns A list of modal files and their imported modules
 */
export const getModalFiles = async () => {
  const modalFiles = await glob("**/modals/individualModals/*.modal.ts");

  // Map files to format the rest registration needs
  const importedFiles = await Promise.all(
    modalFiles.map((file) => import(`./../../${file}`)),
  );

  return { modalFiles, importedFiles };
};
