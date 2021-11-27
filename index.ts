import Discord, {
  Intents,
  Interaction,
  Message,
  MessageEmbed,
} from "discord.js";
import { callAndResponse, commands, generateFiniBucks } from "./modules";
import dotenv from "dotenv";

// Run config to get our environment variables
dotenv.config();

// Create Discord client and login to Discord API
const disClient = new Discord.Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});
disClient.login(process.env.FINI_TOKEN);

// Once ready, let me know in the console so I can jump out
disClient.once("ready", () => {
  console.log("I'm ready");
  console.log("Ctrl+A D to detach session");
});

// Now for the actual meat of the operation
//   First check for typing indicators to send out health reminder pings
// disClient.on("typingStart", async (channel: Channel) => {
//   // Do the Health Ping
//   // healthyTime();
//   console.log("channel:", channel);
// });

const commandPrefix = "fini ";

disClient.on("interactionCreate", async (interaction: Interaction) => {
  if (!interaction.isCommand()) return;

  const test = interaction.options.getString("wager");
  const embed = new MessageEmbed()
    .setColor("#0099ff")
    .setTitle("Haha you silly bitch")
    .setDescription(test);
  await interaction.reply({ embeds: [embed] });
});

//  Now handling full on messages
disClient.on("messageCreate", async (message: Message) => {
  // We don't care about bots. Sad but true.
  if (message.author.bot) return;

  message.guild.commands.create({
    description: "A test of discord's command system",
    name: "fini-test-2",
    options: [
      {
        description: "option one",
        name: "wager",
        type: "STRING",
        required: true,
      },
      {
        description: "a int option",
        name: "int",
        type: "INTEGER",
        required: true,
      },
      {
        description: "a num option",
        name: "num",
        type: "NUMBER",
        required: true,
      },
      {
        description: "a bool option",
        name: "bool",
        type: "BOOLEAN",
        required: true,
      },
      {
        description: "a user option",
        name: "user",
        type: "USER",
        required: true,
      },
      {
        description: "a role option",
        name: "role",
        type: "ROLE",
        required: true,
      },
      {
        description: "a mention option",
        name: "mention",
        type: "MENTIONABLE",
        required: true,
      },
    ],
  });

  // Lowercase makes comparisons way easier
  const messageText = message.content.toLowerCase();

  // Next look for actual fini commands
  if (messageText.startsWith(commandPrefix)) {
    // This looks like a command, but which one?

    // Fini commands should always be `fini {command} {arguments...}`
    const messageParts: string[] = messageText
      .replace(commandPrefix, "")
      .split(" ");
    const command: string = messageParts[0];
    const args: string[] = messageParts.slice(1);

    // Run the command
    commands(command, args, message)
      .then((commandResult) => {
        message.channel.send(commandResult);
      })
      .catch((err) => console.error(err));
  } else {
    // No command here. But someone is engaging the server. Let's reward them :)
    generateFiniBucks(message);

    // Check if this was some sort of call and response message
    // First check for any simple call-and-response's
    const response = callAndResponse(messageText);
    if (response) {
      message.channel.send(response);
    }

    return;
  }
});
