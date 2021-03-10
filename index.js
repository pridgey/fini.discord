const Discord = require("discord.js");
const { slap } = require("./commands/slap.js");
const { blame } = require("./commands/blame");
const { add } = require("./commands/add");
const { spout } = require("./commands/spout");
require("dotenv").config();

// Create client and log in
const client = new Discord.Client();
client.login(process.env.FINI_TOKEN);

client.once("ready", () => {
  console.log("I'm ready");
  console.log("Ctrl+A D to detach");
});

client.once("shareReconnecting", () => {
  console.log("Fuck, reconnecting...");
});

client.once("disconnect", () => {
  console.log("Peace, I'm out");
});

// The magic
client.on("message", async (message) => {
  // Prefix
  const prefix = "fini ";

  // Don't care about the things the bot says
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const commandPrefix = prefix.toLowerCase();

  if (content.includes("good bot")) {
    // Good bot
    message.channel.send("=D");
  }
  // Ignore non-prefixes
  else if (!content.startsWith(commandPrefix)) {
    return;
  } else {
    // Let's grab the command
    const userMessageParts = content.split(" ");
    const command = userMessageParts[1]; // Should always be the word after "fini"

    switch (command) {
      case "slap":
        slap(message, content);
        break;
      case "blame":
        blame(message, content);
        break;
      case "add":
        add(message, content);
        break;
      case "spout":
        spout(message, content);
        break;
      case "minecraft":
        message.channel.send(
          "The minecraft server is on mc.pridgey.dev and is currently using mc eternal 1.3.7.1.\r\nMods you must remove: `RandomPatches (Forge)`\r\nMods you can remove if you need performance: `JourneyMap`, `JEI`"
        );
        break;
    }
  }
});
