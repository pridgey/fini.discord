import {
  ChannelType,
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
import { getCommandFiles } from "./utilities/interactionFiles/getInteractionFiles";
import { splitBigString } from "./utilities/splitBigString";
const { exec } = require("child_process");
import { readFile, writeFile } from "fs/promises";
import { initializeServerBank } from "./modules/finicoin/initialize";
import { chatWithUser_Llama } from "./modules/llama/converse";
import {
  handleButtonInteraction,
  loadButtonHandlers,
} from "./buttons/buttonHandler";
import { converseWithAI } from "./modules/aiChat/aiChat";
import { ReplyContext } from "./modules/aiChat/formatReplyContext";
import {
  handleModalInteraction,
  loadModalHandlers,
} from "./modals/modalHandler";
import { fileExists } from "./utilities/files/fileUtilities";

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
client.once("clientReady", async (cl) => {
  console.log("Connected");

  // Load button files for handling
  await loadButtonHandlers();
  // Load modal files for handling
  await loadModalHandlers();

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
  const fileExistsFlag = await fileExists(fileName);
  if (fileExistsFlag) {
    // What does the file say?
    const fileContents = await readFile(fileName);

    console.log("Update File Contents:", fileContents);
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
            }${s}`,
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
  // If this isn't a text-based channel, ignore
  if (
    !message.channel.isTextBased() ||
    message.channel.type === ChannelType.GroupDM
  )
    return;

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
    const channel = message.channel;

    // Send temporary typing message, loop until we are done
    const typingLoop = setInterval(() => {
      channel.sendTyping();
    }, 1000 * 11);

    await channel.sendTyping();

    // Grab any attachments if they exist
    // const allAttachments = message.attachments; // TODO: Implement multiple attachments

    let response: string;
    let command = "hey fini";

    let messageReply;
    if (message.reference?.messageId) {
      try {
        messageReply = await message.fetchReference();
      } catch (err) {
        console.error("Error fetching message reference:", err);
      }
    }
    const replyText = messageReply?.content?.replaceAll("hey fini", "").trim();

    // Who wrote the quoted message changes what the user is asking for, so
    // pass the attribution along rather than just the text. Prefer the server
    // nickname - that's the name the rest of the channel is using for them.
    const reply: ReplyContext | undefined =
      messageReply && replyText?.length
        ? {
            text: replyText,
            authorName:
              messageReply.member?.displayName ||
              messageReply.author.displayName ||
              messageReply.author.username,
            authorIsUser: messageReply.author.id === messageUser,
            authorIsSelf: messageReply.author.id === message.client.user.id,
            authorIsBot: messageReply.author.bot,
          }
        : undefined;

    console.log("Debug - Message Reference:", { reply });

    // New AI Conversion logic. converseWithAI reads the user's /chat-config
    // preference and routes to local llama.cpp (default) or Claude.
    response = await converseWithAI({
      userID: messageUser,
      message: messageText.replace(command, ""),
      reply,
      server: message.guildId ?? "unknown",
      attachment: message.attachments.at(0),
    });

    // DEPRECATED
    // Open AI Text
    // response = await chatWithUser_OpenAI(
    //   messageUser,
    //   messageText.replace(command, ""),
    //   message.guildId ?? "unknown",
    //   attachment,
    // );

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
  } else if (messageTextLower.startsWith("hey ollama")) {
    const channel = message.channel;

    // Send temporary typing message, loop until we are done
    const typingLoop = setInterval(() => {
      channel.sendTyping();
    }, 1000 * 11);

    await channel.sendTyping();

    // Grab any attachments if they exist
    const allAttachments = message.attachments;

    let response;
    let command = "hey ollama";

    // Ollama AI Text
    response = await chatWithUser_Llama(
      messageUser,
      messageText.replace(command, ""),
      message.guildId ?? "unknown",
      allAttachments,
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

  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    if (!interaction.channel?.isTextBased()) return;
    if (interaction.channel?.type === ChannelType.GroupDM) return;

    const channel = interaction.channel;

    // Display warning if not on main branch
    exec("git rev-parse --abbrev-ref HEAD", (err, stdout) => {
      if (err) {
        console.error("Error occurred while showing git warning:", err);
      }
      if (typeof stdout === "string" && stdout.trim() !== "main") {
        channel?.send(
          "*I'm currently operating in debug mode and my creator is bad at coding, use at your own risk*",
        );
      }
    });

    try {
      // Get the commands name
      const { importedFiles: commands } = await getCommandFiles();
      const commandToRun = commands.find(
        (c) => c.data.name === interaction.commandName,
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
  } else if (interaction.isAutocomplete()) {
    /*
     * Autocomplete is opt-in per command: a command that needs it exports an
     * `autocomplete` function alongside `execute`. /horsey is the first, and it
     * needs one because slash command choices are baked in when the command is
     * registered, so they cannot vary per server - autocomplete is resolved
     * per interaction and can read that guild's config.
     *
     * Discord expects a response within three seconds and there is no way to
     * defer one, so a failure here has to fall through to an empty list rather
     * than throw and leave the picker hanging.
     */
    try {
      const { importedFiles: commands } = await getCommandFiles();
      const commandToRun = commands.find(
        (c) => c.data.name === interaction.commandName,
      );

      if (typeof commandToRun?.autocomplete === "function") {
        await commandToRun.autocomplete(interaction);
      } else {
        await interaction.respond([]);
      }
    } catch (err) {
      console.error("Error running autocomplete:", err);
      await interaction.respond([]).catch(() => undefined);
    }
  } else if (interaction.isButton()) {
    // Handle button interactions
    await handleButtonInteraction(interaction);
  } else if (interaction.isModalSubmit()) {
    // Handle modal interactions
    await handleModalInteraction(interaction);
  }
});

// Let's gooooooo
client.login(process.env.FINI_TOKEN);
