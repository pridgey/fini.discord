import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  Message,
  MessageFlags,
} from "discord.js";
import { rollJackpot } from "./modules/finicoin/jackpot";
import { rewardCoin } from "./modules/finicoin/reward";
import { createLog } from "./modules/logger";
import { runPollTasks } from "./modules/polling";
import { runGeoDaily } from "./modules/dailies/geo/daily";
import { runWeaveDaily } from "./modules/dailies/weave/daily";
import { getCommandFiles } from "./utilities/interactionFiles/getInteractionFiles";
import { splitBigString } from "./utilities/splitBigString";
const { exec } = require("child_process");
import { readFile, writeFile } from "fs/promises";
import { initializeServerBank } from "./modules/finicoin/initialize";
import {
  handleButtonInteraction,
  loadButtonHandlers,
} from "./buttons/buttonHandler";
import { answerHeyFini, isHeyFini } from "./modules/aiChat/heyFini";
import {
  handleModalInteraction,
  loadModalHandlers,
} from "./modals/modalHandler";
import { fileExists } from "./utilities/files/fileUtilities";
import { resetShareDir, startShareServer } from "./modules/fileShare";
import { startWebSync } from "./modules/finicards/webSync";
import { makeCardPoster } from "./modules/finicards/webSync/showCard";
import { startCardManager } from "./modules/finicards/cardManagerServer";

/**
 * Recorded as a command's output when its reply cannot be read back - the
 * interaction expired before the command answered it, so there is no message
 * to fetch. Written rather than dropping the log so the `log` table shows the
 * command ran and failed to answer.
 */
const NO_REPLY_OUTPUT = "<no reply - interaction expired>";

/*
 * The last line of defence. An unhandled rejection otherwise ends the process,
 * and `bun start` stops Pocketbase and llama along with it - so one missed
 * `.catch` anywhere would take the whole stack down. Logged loudly instead:
 * each one is still a bug to fix where it happened.
 */
process.on("unhandledRejection", (reason) => {
  console.error(
    "Unhandled promise rejection - this is a bug, the bot kept running:",
    reason,
  );
});

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

  /*
   * Serves files too large for Discord's uploader. Bound to loopback and
   * fronted by Tailscale Funnel; off entirely unless FINI_SHARE_BASE_URL is
   * set. Started before anything can produce a file to share, and the share
   * directory is emptied first because the token map does not survive a
   * restart - anything already on disk is unreachable.
   */
  await resetShareDir();
  await startShareServer();

  /* The Finicards site: copies collections out to a public mailbox and takes
   * deck requests back. Off unless FINI_WEB_POCKETBASE_URL is set. */
  startWebSync(
    () =>
      Object.fromEntries(
        cl.guilds.cache.map((guild) => [guild.id, guild.name]),
      ),
    makeCardPoster(cl),
  );

  /* The card manager, for the home network. Off unless FINI_CARD_MANAGER_PORT
   * is set. */
  startCardManager();

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

  // A daily that is due goes out now rather than at the first poll a minute on.
  runGeoDaily(cl).then(() => runWeaveDaily(cl));

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

  // Good bot reaction
  if (messageTextLower === "good fini") {
    await message.react("💖");
  }

  // Bad bot reaction
  if (messageTextLower === "bad fini") {
    await message.react("🥲");
  }

  // Fini chat
  if (isHeyFini(messageText)) {
    await answerHeyFini(message);
  } else {
    // Regular messages should be rewarded finicoin
    await rewardCoin(message);
  }
});

/**
 * The options a command was run with, for the command log.
 *
 * Every declared option is listed, set or not, so a log row shows what was
 * left at its default. A command with subcommands declares those rather than
 * options at the top level, so for one of those the options listed are the
 * ones under whichever subcommand was run, under its name.
 */
const describeOptions = (
  interaction: ChatInputCommandInteraction,
  declared: { name: string; toJSON: () => unknown }[],
): string[] => {
  const subcommand = interaction.options.getSubcommand(false);
  const options = subcommand
    ? ((
        declared.find((o) => o.name === subcommand)?.toJSON() as {
          options?: { name: string }[];
        }
      )?.options ?? [])
    : declared;

  return [
    ...(subcommand ? [`subcommand: ${subcommand}`] : []),
    ...options.map(
      (o) => `${o.name}: ${interaction.options.get(o.name)?.value}`,
    ),
  ];
};

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

      /*
       * Execute the command. Logging is handed to the command as a callback so
       * it can decide when the reply exists to be read back; a command that
       * never calls it is logged when it finishes, so a forgotten path can't
       * lose the row. Commands call it un-awaited, so nothing here may
       * reject: an unhandled rejection takes the bun process down, and
       * `--kill-others-on-fail` takes pocketbase and llama with it. A /clear
       * that outran Discord's three second response window did exactly that -
       * `fetchReply` threw 10015 Unknown Webhook on an interaction that never
       * got a reply, and the whole stack restarted.
       *
       * A dead interaction also has no reply to read, so the output falls back
       * to a marker rather than skipping the log. The failed /clear wrote no
       * row at all, which left the `log` table showing an unbroken run of
       * successes while users were watching the command fail.
       */
      // Written once: when the command asks, or when it finishes if it never did.
      let logged = false;
      const logCommand = async () => {
        if (logged) return;
        logged = true;
        try {
          let output = "";

          try {
            output = (await interaction.fetchReply()).content;
          } catch (fetchErr) {
            console.error("Error reading reply for command log:", fetchErr);
            output = NO_REPLY_OUTPUT;
          }

          await createLog({
            command: `/${commandToRun.data.name}`,
            input: `Command options:\n${describeOptions(
              interaction,
              commandToRun.data.options,
            ).join(",\n")}`,
            output,
            server_id: interaction.guild?.id || "unknown",
            user_id: interaction.user.id,
          });
        } catch (logErr) {
          console.error("Error logging command:", logErr);
        }
      };

      try {
        await commandToRun.execute(interaction, logCommand);
      } finally {
        await logCommand();
      }
    } catch (err) {
      const error: Error = err as Error;
      console.error("Error running interaction:", { error });
      /* The command may already have deferred or replied, and the interaction
         may be gone altogether (expired, or the failure *was* the reply) - in
         which case this throws too, and unhandled it takes the bot down. */
      try {
        const message = {
          content: `I fucked up D:\n${error.message}`,
          flags: [MessageFlags.Ephemeral] as [MessageFlags.Ephemeral],
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(message);
        } else {
          await interaction.reply(message);
        }
      } catch (replyError) {
        console.error("Couldn't report the interaction error:", replyError);
      }
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

/**
 * Pocketbase starts alongside the bot (`bun start`), and on a restart the bot
 * can be ready first. Its first database call then fails and takes the bot
 * down until systemd starts it again, about ten seconds later - long enough
 * for commands to go unanswered. So the bot waits until Pocketbase answers
 * before it logs in, for up to a minute.
 */
const waitForPocketbase = async () => {
  const health = `${process.env.POCKETBASE_URL ?? ""}/api/health`;
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch(health, {
      signal: AbortSignal.timeout(2000),
    }).catch(() => null);
    if (response?.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.error("Pocketbase didn't answer within a minute; logging in anyway");
};

// Let's gooooooo
waitForPocketbase().then(() => client.login(process.env.FINI_TOKEN));
