import { glob } from "glob";

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
