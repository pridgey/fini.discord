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
    const guildId = process.env.GEKIN_SERVERID || "";

    rest.on("rateLimited", (res) => console.log("OnRateLimited:", { res }));

    // First, delete all guild commands to clear out old ones
    const response = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      {
        body: [],
      }
    );

    console.log("Deleted Guild Commands", { response });
    console.log("");

    console.groupEnd();
  } catch (err: unknown) {
    console.error(`Error registering commands (${Date.now()}):`, { err });
    console.error(" ");
  }
};

deleteAllCommands();
