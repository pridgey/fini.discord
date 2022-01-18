import { Client, ClientOptions, Collection, Intents } from "discord.js";
import dotenv from "dotenv";
import glob from "glob";
import { Command } from "./types";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { db } from "./utilities";

// Run config to get our environment variables
dotenv.config();

/* Create a custom client because Discord.js client doesn't actually
   have a "commands" property on it, despite telling me to do it this
   way in their documentation :/
*/
export class FiniClient extends Client {
  constructor(options: ClientOptions) {
    super(options);
  }
  commands: Collection<string, any> = new Collection();
}

// Initialize our discord client
const client = new FiniClient({ intents: [Intents.FLAGS.GUILDS] });

// Create a collection for our commands
client.commands = new Collection();

// Read everything in our commands directory
// Might be able to do this better with a glob?
glob("**/commands/**/*.command.js", (err: Error, files: string[]) => {
  if (err) {
    console.error(`${Date.now()}: ${err.message}`);
    console.error(err.stack);
    console.error(" ");
  } else {
    console.log("Files:", files);
    for (const file of files) {
      import(`./${file.replace("dist/", "")}`).then((cmd: any) => {
        console.log("Command:", cmd);
        // Pass in the command, named by the file and value set to the function to run
        client.commands.set(cmd.data.name, cmd);
      });
    }
  }
});

// WE READY
client.once("ready", () => {
  // const rest = new REST({ version: "9" }).setToken(process.env.FINI_TOKEN);
  console.log("Ready!");
  client.commands.forEach((cmd) => {
    console.log("Cmd:", cmd);
  });
});

// If we get a slash command, run the slash command.
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    return interaction.reply({
      content: "I fucked up D=",
      ephemeral: true,
    });
  }
});

// Let's gooooooo
client.login(process.env.FINI_TOKEN);

// // Create Discord client and login to Discord API
// const disClient = new Discord.Client({
//   intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
// });
// disClient.login(process.env.FINI_TOKEN);

// // Once ready, let me know in the console so I can jump out
// disClient.once("ready", () => {
//   console.log("I'm ready");
//   console.log("Ctrl+A D to detach session");
// });

// // Now for the actual meat of the operation
// //   First check for typing indicators to send out health reminder pings
// // disClient.on("typingStart", async (channel: Channel) => {
// //   // Do the Health Ping
// //   // healthyTime();
// //   console.log("channel:", channel);
// // });

// const commandPrefix = "fini ";

// disClient.on("interactionCreate", async (interaction: Interaction) => {
//   if (!interaction.isCommand()) return;

//   const test = interaction.options.getString("wager");
//   const embed = new MessageEmbed()
//     .setColor("#0099ff")
//     .setTitle("Haha you silly bitch")
//     .setDescription(test);
//   await interaction.reply({ embeds: [embed] });
// });

// //  Now handling full on messages
// disClient.on("messageCreate", async (message: Message) => {
//   // We don't care about bots. Sad but true.
//   if (message.author.bot) return;

//   // message.guild.commands.create({
//   //   description: "A test of discord's command system",
//   //   name: "fini-test-2",
//   //   options: [
//   //     {
//   //       description: "option one",
//   //       name: "wager",
//   //       type: "STRING",
//   //       required: true,
//   //     },
//   //     {
//   //       description: "a int option",
//   //       name: "int",
//   //       type: "INTEGER",
//   //       required: true,
//   //     },
//   //     {
//   //       description: "a num option",
//   //       name: "num",
//   //       type: "NUMBER",
//   //       required: true,
//   //     },
//   //     {
//   //       description: "a bool option",
//   //       name: "bool",
//   //       type: "BOOLEAN",
//   //       required: true,
//   //     },
//   //     {
//   //       description: "a user option",
//   //       name: "user",
//   //       type: "USER",
//   //       required: true,
//   //     },
//   //     {
//   //       description: "a role option",
//   //       name: "role",
//   //       type: "ROLE",
//   //       required: true,
//   //     },
//   //     {
//   //       description: "a mention option",
//   //       name: "mention",
//   //       type: "MENTIONABLE",
//   //       required: true,
//   //     },
//   //   ],
//   // });

//   // Lowercase makes comparisons way easier
//   const messageText = message.content.toLowerCase();

//   // Next look for actual fini commands
//   if (messageText.startsWith(commandPrefix)) {
//     // This looks like a command, but which one?

//     // Fini commands should always be `fini {command} {arguments...}`
//     const messageParts: string[] = messageText
//       .replace(commandPrefix, "")
//       .split(" ");
//     const command: string = messageParts[0];
//     const args: string[] = messageParts.slice(1);

//     // Run the command
//     commands(command, args, message)
//       .then((commandResult) => {
//         message.channel.send(commandResult);
//       })
//       .catch((err) => console.error(err));
//   } else {
//     // No command here. But someone is engaging the server. Let's reward them :)
//     generateFiniBucks(message);

//     // Add message to db for training later
//     db()
//       .insert("ChatLog", { Content: message.content })
//       .then(() => console.log("Added"));

//     // Check if this was some sort of call and response message
//     // First check for any simple call-and-response's
//     const response = callAndResponse(messageText);
//     if (response) {
//       message.channel.send(response);
//     }

//     return;
//   }
// });
