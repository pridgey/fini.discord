const { REST, Routes } = require("discord.js");

const deleteAllCommands = async () => {
  try {
    console.log("====== DELETE COMMANDS ======");
    console.group();

    // Utilize discord's REST module for registering commands
    const rest = new REST().setToken(process.env.FINI_TOKEN || "");

    // Fini client ID
    const clientId = process.env.FINI_CLIENTID || "";

    rest.on("rateLimited", (res) => console.log("OnRateLimited:", { res }));

    // First, delete all guild commands to clear out old ones
    const response = await rest.put(Routes.applicationCommands(clientId), {
      body: [],
    });

    console.log("Deleted Guild Commands", { response });
    console.log("");

    console.groupEnd();
  } catch (err) {
    console.error(
      `Error registering commands (${Date.now()}): ${err.message}`,
      { err }
    );
    console.error(err.stack);
    console.error(" ");
  }
};

deleteAllCommands();
