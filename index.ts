import {
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  Message,
} from "discord.js";
import { rollJackpot } from "./modules/finicoin/jackpot";
import { rewardCoin } from "./modules/finicoin/reward";
import { createLog } from "./modules/logger";
import { chatWithUser_OpenAI } from "./modules/openai";
import { runPollTasks } from "./modules/polling";
import { getCommandFiles } from "./utilities/commandFiles/getCommandFiles";
import { splitBigString } from "./utilities/splitBigString";
const { exec } = require("child_process");
import { exists, readFile, writeFile } from "fs/promises";
import { initializeServerBank } from "./modules/finicoin/initialize";

// Initialize client and announce intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

let pollingInterval;

// WE READY
client.once("ready", async (cl) => {
  console.log("Connected");

  // Initialize connected guilds to ensure they have the proper bank records
  for (const guild of cl.guilds.cache.values()) {
    await initializeServerBank(guild.id, guild.name);
  }

  // Set interval for periodic things
  if (!pollingInterval) {
    console.log("Creating Poll Interval...");
    pollingInterval = setInterval(() => {
      runPollTasks(cl);
    }, 60_000);
  }

  // Read update.txt for update logs and announce them
  const fileName = "update.txt";
  const fileExists = await exists(fileName);
  if (fileExists) {
    // What does the file say?
    const fileContents = await readFile(fileName);

    console.log("File Contents:", fileContents);
    if (!!fileContents.length) {
      // Get all guilds
      const guilds = await cl.guilds.fetch();

      // For each guild, get the system channel and send the update
      guilds.forEach(async (g) => {
        const guild = await g.fetch();

        const splitMessage = splitBigString(fileContents.toString());

        splitMessage.forEach(async (s, index) => {
          await guild.systemChannel?.send(
            `${
              index === 0
                ? `**${new Date().toLocaleDateString()} Update:**\r\n`
                : ""
            }${s}`
          );
        });
      });

      // Empty the file out
      await writeFile(fileName, "");
    }
  }
});

// Event to fire when a reaction is added to a message
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.id !== reaction.message.author?.id) {
    // A reaction was added to a message, roll jackpot chances
    await rollJackpot(reaction.message, true);
  }
});

// Event to fire when a user chats
client.on("messageCreate", async (message: Message) => {
  // We don't care about bots. Sad but true.
  if (message.author.bot) return;

  // Lowercase makes comparisons way easier
  const messageText = message.content;
  const messageTextLower = messageText.toLowerCase();
  const messageUser = message.author.id;

  // Good bot reaction
  if (messageTextLower === "good fini") {
    await message.react("💖");
  }

  // Bad bot reaction
  if (messageTextLower === "bad fini") {
    await message.react("🥲");
  }

  // Fini chat
  if (messageTextLower.startsWith("hey fini")) {
    // Send temporary typing message, loop until we are done
    const typingLoop = setInterval(() => {
      message.channel.sendTyping();
    }, 1000 * 11);

    await message.channel.sendTyping();

    // Grab any attachments if they exist
    const allAttachments = message.attachments;
    const attachment = message.attachments.at(0)?.url;

    let response;
    let command = "hey fini";

    // Open AI Text
    response = await chatWithUser_OpenAI(
      messageUser,
      messageText.replace(command, ""),
      message.guildId ?? "unknown",
      attachment
    );

    // Log hey fini interaction
    await createLog({
      user_id: message.author.id,
      server_id: message.guild?.id || "unknown",
      command,
      input: messageText,
      output: response,
    });

    // Clear typing loop
    clearInterval(typingLoop);

    // Split response to discord-sizable chunks
    const replyArray = splitBigString(response);

    // Send replies
    replyArray.forEach(async (str) => await message.reply(str));
  } else {
    // Regular messages should be rewarded finicoin
    await rewardCoin(message);
  }
});

// If we get a slash command, run the slash command.
client.on("interactionCreate", async (interaction) => {
  console.log("Interaction Used", {
    commandName: (interaction as ChatInputCommandInteraction).commandName,
    autocomplete: interaction.isAutocomplete(),
    command: interaction.isCommand(),
    isChatInput: interaction.isChatInputCommand(),
    isButton: interaction.isButton(),
  });

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
    const { importedFiles: commands } = await getCommandFiles();
    const commandToRun = commands.find(
      (c) => c.data.name === interaction.commandName
    );
    // Exit early if we can't find the command to run
    if (!commandToRun) return;

    console.log("Pre-Execute", commandToRun);

    // Execute the command
    await commandToRun.execute(interaction, async () => {
      createLog({
        command: `/${commandToRun.data.name}`,
        input: `Command options:\n${commandToRun.data.options
          .map((o) => {
            const optionName = o.name;
            const optionValue = interaction.options.get(optionName)?.value;
            return `${optionName}: ${optionValue}`;
          })
          .join(",\n")}`,
        output: (await interaction.fetchReply()).content,
        server_id: interaction.guild?.id || "unknown",
        user_id: interaction.user.id,
      });
    });
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running interaction:", { error });
    await interaction.reply({
      content: `I fucked up D:\n${error.message}`,
      ephemeral: true,
    });
  }
});

// Let's gooooooo
client.login(process.env.FINI_TOKEN);
