import { REST, Routes } from "discord.js";
import { glob } from "glob";

const registerAllCommands = async () => {
  try {
    console.log("====== REGISTER COMMANDS ======");
    console.group();

    // Grab each command from the commands directory
    const commandFiles = await glob("**/commands/*.command.ts");

    console.log("Found Command Files:", { commandFiles });
    console.log("");

    // Utilize discord's REST module for registering commands
    const rest = new REST().setToken(process.env.FINI_TOKEN || "");

    // Fini client ID
    const clientId = process.env.FINI_CLIENTID || "";
    // Gekin guild ID
    const gekin_guildId = process.env.GEKIN_SERVERID || "";
    // League of really good friends guild ID
    const league_guildId = process.env.LEAGUE_SERVERID || "";

    const importedFiles = await Promise.all(
      commandFiles
        .filter((file) => !file.includes("archived"))
        .map((file) => import(`./../${file}`))
    );
    const commandData = importedFiles.map((cmdData) => cmdData.data.toJSON());

    console.log("Command Data:", {
      commandData: commandData.map((cd) => cd.name).join(", "),
    });
    console.log("");

    rest.on("rateLimited", (res) => console.log("OnRateLimited:", { res }));

    // Now register the commands for the guilds
    const response_gekin = await rest.put(
      Routes.applicationGuildCommands(clientId, gekin_guildId),
      {
        body: commandData,
      }
    );

    console.log("Registered Commands", { guild: "gekin", response_gekin });
    console.log("");

    const response_league = await rest.put(
      Routes.applicationGuildCommands(clientId, league_guildId),
      {
        body: commandData,
      }
    );

    console.log("Registered Commands", { guild: "league", response_league });
    console.log("");
    console.groupEnd();
  } catch (err) {
    console.error(`Error registering commands (${Date.now()}):`, { err });
    console.error(" ");
  }
};

registerAllCommands();
