import { REST, Routes } from "discord.js";

const deleteAllCommands = async () => {
  try {
    console.log("====== DELETE COMMANDS ======");
    console.group();

    // Utilize discord's REST module for registering commands
    const rest = new REST().setToken(process.env.FINI_TOKEN || "");

    // Fini client ID
    const clientId = process.env.FINI_CLIENTID || "";
    // Guild ID
    const gekin_guildId = process.env.GEKIN_SERVERID || "";
    // League of really good friends guild ID
    const league_guildId = process.env.LEAGUE_SERVERID || "";

    rest.on("rateLimited", (res) => console.log("OnRateLimited:", { res }));

    // First, delete all guild commands to clear out old ones
    const gekin_response = await rest.put(
      Routes.applicationGuildCommands(clientId, gekin_guildId),
      {
        body: [],
      }
    );

    console.log("Deleted Guild Commands", { guild: "gekin", gekin_response });
    console.log("");

    const league_response = await rest.put(
      Routes.applicationGuildCommands(clientId, league_guildId),
      {
        body: [],
      }
    );

    console.log("Deleted Guild Commands", { guild: "gekin", league_response });
    console.log("");

    console.groupEnd();
  } catch (err: unknown) {
    console.error(`Error registering commands (${Date.now()}):`, { err });
    console.error(" ");
  }
};

deleteAllCommands();
