// import { SlashCommandBuilder } from "@discordjs/builders";
// import { CommandInteraction } from "discord.js";
// import brain from "brain.js";
// import * as translateModel from "../../ml-models/model.json";

// export const data = new SlashCommandBuilder()
//   .setName("translate")
//   .setDescription(
//     "Give me english and I'll translate it into a fake language called Revian"
//   )
//   .addStringOption((opt) =>
//     opt
//       .setName("phrase")
//       .setDescription("The phrase you would like translated")
//       .setRequired(true)
//   );

// export const execute = async (interaction: CommandInteraction) => {
//   const textToTranslate = interaction.options.getString("phrase");

//   const net = new brain.recurrent.LSTM();
//   net.fromJSON(translateModel as unknown as brain.INeuralNetworkJSON);

//   const result = (net?.run(textToTranslate) as string)?.toLowerCase();

//   interaction.reply(
//     `${result.substring(0, 1).toUpperCase()}${result.substring(1)}` ||
//       "That had no translation :("
//   );
// };
