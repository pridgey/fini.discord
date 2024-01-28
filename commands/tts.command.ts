import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import type { TtsRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
const { exec } = require("child_process");

// Voice options
const voiceOptions = [
  "angie",
  "applejack",
  "daniel",
  "deniro",
  "emma",
  "freeman",
  "geralt",
  "halle",
  "jlaw",
  "lj",
  "mol",
  "pat",
  "rainbow",
  "snakes",
  "tim_reynolds",
  "tom",
  "weaver",
  "william",
  "vegeta",
];

export const data = new SlashCommandBuilder()
  .setName("tts")
  .setDescription("Create some audio from text")
  .addStringOption((option) =>
    option
      .setName("text")
      .setDescription("The text you want me to speech")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("voice")
      .setDescription("What voice I should use")
      .setRequired(true)
      .addChoices(voiceOptions.map((voice) => [voice, voice]))
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  const text =
    interaction.options.get("text")?.value?.toString() ||
    `[I'm so angry] ${interaction.user.username} is a little bitch and forgot to include a text prompt`;

  const voice =
    interaction.options.get("voice")?.value?.toString().toLowerCase() ||
    "william";

  // Add record to tts table
  const createdTtsRecord = await pb.collection<TtsRecord>("tts").create({
    channel_id: interaction.channelId || "",
    user_id: interaction.user.id,
    server_id: interaction.guildId || "",
    prompt: text,
  });

  if (voiceOptions.includes(voice)) {
    try {
      const commandWithArgs = `/home/pridgey/Documents/Code/fini.discord/scripts/run_tortoise.sh --text "${text}" --language_idx en --model_name "tts_models/multilingual/multi-dataset/xtts_v2" --speaker_wav "/home/pridgey/Documents/Code/third-party/TTS/TTS/voices/${voice}/1.wav" --out_path "/home/pridgey/Documents/Code/fini.discord/tts_output/${createdTtsRecord.id}.wav"`;

      exec(commandWithArgs, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`);
        }
        console.log("Executing Tortoise TTS:", { stdout });
      });
      interaction.reply(
        "Generating file. This may take some time so I'll deliver it later."
      );
    } catch (err) {
      const error: Error = err as Error;
      console.error("Error running /tts command", { error });
    } finally {
      logCommand();
    }
  } else {
    interaction.reply("I don't recognize that voice.");
    logCommand();
  }
};
