import { SlashCommandBuilder } from "@discordjs/builders";
import { AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import OpenAI from "openai";
const util = require("util");
const exec = util.promisify(require("child_process").exec);
import { rmSync } from "fs";
import { ElevenLabs, ElevenLabsClient } from "elevenlabs";

// Voice options
const voiceOptions = [
  "angie",
  "applejack",
  "daniel",
  "deniro",
  "emma",
  "freeman",
  "geralt",
  "gojo",
  "halle",
  "jlaw",
  "joey_wheeler",
  "king",
  "lj",
  "mol",
  "pat",
  "rainbow",
  "snakes",
  "tim_reynolds",
  "tom",
  "vegeta",
  "weaver",
  "william",
];

type openAIVoices = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

// Open AI Voice Options    alloy, echo, fable, onyx, nova, and shimmer
const openAiVoiceOptions: `${openAIVoices}-openai`[] = [
  "alloy-openai",
  "echo-openai",
  "fable-openai",
  "onyx-openai",
  "nova-openai",
  "shimmer-openai",
];

export const data = new SlashCommandBuilder()
  .setName("tts")
  .setDescription("Create some audio from text")
  .addStringOption((option) =>
    option
      .setName("text")
      .setDescription("The text you want me to speech")
      .setRequired(true),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const text =
    interaction.options.get("text")?.value?.toString() ||
    `[I'm so angry] ${interaction.user.username} is a little bitch and forgot to include a text prompt`;

  return interaction.reply("Under construction");

  try {
    interaction.deferReply();
    const client = new ElevenLabsClient({
      apiKey: process.env.ELEVEN_LABS_KEY,
    });
    const audioResponse = await client.textToSpeech.convertAsStream(
      "MiFRvIRg0oGs5KDMogPQ",
      {
        text: text,
        output_format: ElevenLabs.OutputFormat.Mp32205032,
      },
    );

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of audioResponse) {
      chunks.push(chunk as Uint8Array);
    }
    const audioBuffer = Buffer.concat(chunks);

    const attachment = new AttachmentBuilder(audioBuffer, {
      name: `${interaction.user.username}-gojo-${Date.now()}.mp3`,
    });

    await interaction.editReply({
      content: `Prompt: ${text}`,
      files: [attachment],
    });
  } catch (err) {
    interaction.editReply(`I fucked up :(\n${err}`);
  }

  // const voice =
  //   interaction.options.get("voice")?.value?.toString().toLowerCase() ||
  //   "william";

  // // Determines if this is an OpenAI voice, or a local voice
  // const isOpenAI = voice.endsWith("-openai");

  // if (isOpenAI) {
  //   // Generate TTS from OpenAI
  //   await interaction.deferReply();

  //   try {
  //     const openai = new OpenAI({
  //       apiKey: process.env.OPENAI_API_KEY || "no_key_found",
  //     });

  //     const speech = await openai.audio.speech.create({
  //       model: "tts-1",
  //       voice: voice.replace("-openai", "") as openAIVoices,
  //       input: text.replaceAll('"', "'") || "I did not receive anything!",
  //     });

  //     const buffer = Buffer.from(await speech.arrayBuffer());
  //     const attachment = new AttachmentBuilder(buffer, {
  //       name: `${interaction.user.username}-${voice}-${Date.now()}.mp3`,
  //     });
  //     // const attachment = new MessageAttachment(buffer, "fini.mp3");

  //     await interaction.editReply({
  //       content: `Prompt: ${text}`,
  //       files: [attachment],
  //     });
  //   } catch (err) {
  //     console.error("Error generating OpenAI TTS:", err);
  //     await interaction.editReply("Something went wrong.");
  //   } finally {
  //     logCommand();
  //   }
  // } else {
  //   // Generate TTS using local models
  //   await interaction.deferReply();

  //   try {
  //     const fileName = `${interaction.user.username}-${voice}-${Date.now()}`;
  //     const modelName = "tts_models/multilingual/multi-dataset/xtts_v2";
  //     const speakerWav = `/home/pridgey/Documents/Code/third-party/TTS/TTS/voices/${voice}/1.wav`;
  //     const outPath = `${process.env.FINI_PATH}/tts_output/${fileName}.wav`;
  //     const commandWithArgs = `${
  //       process.env.FINI_PATH
  //     }/scripts/run_tts.sh --text "${text.replaceAll(
  //       '"',
  //       "'"
  //     )}" --language_idx en --model_name "${modelName}" --speaker_wav "${speakerWav}" --out_path "${outPath}"`;

  //     // Run the script to generate TTS
  //     const { stderr } = await exec(commandWithArgs);

  //     if (stderr) {
  //       console.error("TTS Exec stderr:", { stderr });
  //     }

  //     const attachment = new AttachmentBuilder(outPath);

  //     await interaction.editReply({
  //       content: `Prompt: ${text}`,
  //       files: [attachment],
  //     });

  //     // Delete file
  //     await rmSync(outPath);
  //   } catch (err) {
  //     const error: Error = err as Error;
  //     console.error("Error running /tts command", { error });
  //   } finally {
  //     logCommand();
  //   }
  // }
};
