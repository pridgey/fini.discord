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

let lastUpdate = 0;
client.on("typingStart", async (channel) => {
  const current = Date.now();
  const hoursToWait = 4;
  if (current - lastUpdate >= 1000 * 60 * 60 * hoursToWait) {
    const messages = [
      "relax your shoulders",
      "unclench your jaw",
      "check your posture",
      "release your tongue from the top of your mouth",
      "stare at something (not a screen) 20 feet away for 20 seconds",
      "tilt your head back and groan like chewbacca! It helps I swear",
      "stretch your arms and legs",
      "maybe do 10 jumping jacks",
      "take 3 deep breaths out of both nostrils",
      "drink water",
      "pester Josh",
      "call your mother",
      "say 'good bot'",
    ];
    // If it's been more than an hour since last update
    lastUpdate = current;
    channel.send(
      `Friendly reminder to ${
        messages[Math.round(Math.random() * messages.length)]
      } :D`
    );
  }
});

// Loop
setInterval(() => {
  client.m;
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
