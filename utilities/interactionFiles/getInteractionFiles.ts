import { glob } from "glob";

/**
 * Dynamicly finds all of the command files in the commands directory
 * @returns A list of command files and their imported modules
 */
export const getCommandFiles = async () => {
  // Grab each command from the commands directory
  const commandFiles = await glob("**/commands/*.command.ts");

  // Map files to format the rest registration needs
  const importedFiles = await Promise.all(
    commandFiles
      .filter((file) => !file.includes("archived"))
      .map((file) => import(`./../../${file}`))
  );

  return { commandFiles, importedFiles };
};

/**
 * Dynamicly finds all of the button files in the buttons directory
 * @returns A list of button files and their imported modules
 */
export const getButtonFiles = async () => {
  const buttonFiles = await glob("**/buttons/individualButtons/*.button.ts");

  // Map files to format the rest registration needs
  const importedFiles = await Promise.all(
    buttonFiles
      .filter((file) => !file.includes("archived"))
      .map((file) => import(`./../../${file}`))
  );

  return { buttonFiles, importedFiles };
};
