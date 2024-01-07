import { Client, GatewayIntentBits, Message, REST, Routes } from "discord.js";
import { glob } from "glob";
import { runPollTasks } from "./modules";
import { chatWithUser } from "./modules/openai";
import { splitBigString } from "./utilities";
const { exec } = require("child_process");

// Initialize client and announce intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.MessageContent,
  ],
});

// Runs once when the typingStart command fires. Registers all commands for a guild
let commands: any[] = [];
client.once("typingStart", async (event) => {
  try {
    console.log("====== REGISTER COMMANDS ======");
    console.group();

    // Grab each command from the commands directory
    const commandFiles = await glob("**/commands/*.command.js");

    console.log("Found Command Files:", { commandFiles });
    console.log("");

    // Utilize discord's REST module for registering commands
    const rest = new REST().setToken(process.env.FINI_TOKEN || "");

    // Fini client ID
    const clientId = process.env.FINI_CLIENTID || "";
    // The guild ID
    const guildId = event?.guild?.id || "";

    // Map files to format the rest registration needs
    const importedFiles = await Promise.all(
      commandFiles
        .filter((file) => !file.includes("archived"))
        .map((file) => import(`./${file.replace("dist/", "")}`))
    );
    commands = importedFiles;
    const commandData = importedFiles.map((cmdData) => cmdData.data.toJSON());

    console.log("Command Data:", { commandData });
    console.log("");

    // First, delete all guild commands to clear out old ones
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: [],
    });

    console.log("Deleted Guild Commands");
    console.log("");

    // Now register the commands
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commandData,
    });

    console.log("Registered Commands");
    console.log("");
    console.groupEnd();
  } catch (err: unknown) {
    const error: Error = err as Error;
    console.error(`${Date.now()}: ${error.message}`);
    console.error(error.stack);
    console.error(" ");
  }
});

let pollingInterval;

// WE READY
client.once("ready", (cl) => {
  console.log("Connected");

  // Set interval for periodic things
  if (!pollingInterval) {
    console.log("Creating Poll Interval...");
    pollingInterval = setInterval(() => {
      runPollTasks(cl);
    }, 60_000);
  }
});

client.on("messageCreate", async (message: Message) => {
  // We don't care about bots. Sad but true.
  if (message.author.bot) return;

  // Lowercase makes comparisons way easier
  const messageText = message.content.toLowerCase();
  const messageUser = message.author.username;

  console.log("Message:", { message: message.content });

  // Good bot reaction
  if (messageText === "good bot") {
    await message.react("💖");
  }

  // Bad bot reaction
  if (messageText === "bad bot") {
    await message.react("🥲");
  }

  // Fini chat
  if (messageText.startsWith("hey fini")) {
    // Send temporary typing message, loop until we are done
    const typingLoop = setInterval(() => {
      message.channel.sendTyping();
    }, 1000 * 11);

    await message.channel.sendTyping();

    // Grab any attachments if they exist
    const attachment = message.attachments.at(0)?.url;

    // Contact openai api
    const response = await chatWithUser(
      messageUser,
      messageText.replace("hey fini", ""),
      attachment
    );

    // Clear typing loop
    clearInterval(typingLoop);

    // Split response to discord-sizable chunks
    const replyArray = splitBigString(response);

    // Send replies
    replyArray.forEach(async (str) => await message.channel.send(str));
  }
});

// If we get a slash command, run the slash command.
client.on("interactionCreate", async (interaction) => {
  // Ignore if not a command
  if (!interaction.isCommand()) return;

  // Display warning if not on main branch
  exec("git rev-parse --abbrev-ref HEAD", (err, stdout) => {
    if (err) {
      console.error("Error occurred while showing git warning:", err);
    }
    if (typeof stdout === "string" && stdout.trim() !== "main") {
      interaction.channel?.send(
        "*I'm currently operating in debug mode and my creator is bad at coding, use at your own risk*"
      );
    }
  });

  try {
    // Get the commands name
    const commandToRun = commands.find(
      (c) => c.data.name === interaction.commandName
    );
    if (!commandToRun) return;
    // Execute the command
    commandToRun.execute(interaction);
  } catch (err) {
    const error: Error = err as Error;
    interaction.reply({
      content: `I fucked up D:\n${error.message}`,
      ephemeral: true,
    });
  }
});

// client.on("interactionCreate", async (interaction) => {
//   if (!interaction.isCommand()) return;

//   // Let people know this isn't a final version
//   exec("git rev-parse --abbrev-ref HEAD", (err, stdout) => {
//     if (err) {
//       console.error("Error:", err);
//     }
//     if (typeof stdout === "string" && stdout.trim() !== "main") {
//       interaction?.channel?.send(
//         "*I'm currently operating in debug mode and my creator is bad at coding, use at your own risk*"
//       );
//     }
//   });

//   // grab the command name
//   const command = client.commands.get(interaction.commandName);

//   // No command, no run
//   if (!command) return;

//   try {
//     await command.execute(interaction);
//   } catch (error) {
//     console.error(error);
//     return interaction.reply({
//       content: "I fucked up D:",
//       ephemeral: true,
//     });
//   }
// });

// Let's gooooooo
client.login(process.env.FINI_TOKEN);
