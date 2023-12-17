import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction } from "discord.js";
import { LogHammerspaceItem } from "./../utilities/logHammerspaceItem";
import { db } from "./../utilities/db";
import { HammerspaceItem, SentenceItem, PhraseItem } from "./../types";
import brain from "brain.js";

export const data = new SlashCommandBuilder()
  .setName("spout")
  .setDescription("I'll spout off a random sentence for you")
  .addBooleanOption((opt) =>
    opt.setName("ai").setDescription("Use AI Spout Model")
  );

export const execute = async (interaction: CommandInteraction) => {
  const useAI = interaction.options.getBoolean("ai");

  if (useAI) {
    // Run ml version
    const net = new brain.recurrent.LSTM();
    //net.fromJSON(spoutModel as unknown as brain.INeuralNetworkJSON);

    db()
      .select<HammerspaceItem>(
        "Hammerspace",
        "Random",
        interaction?.guildId || ""
      )
      .then((results) => {
        if (results[0]) {
          // The item
          let item = results[0].Item;

          const result = net.run(item).toString().toLowerCase();

          interaction.reply(
            `${result.substring(0, 1).toUpperCase()}${result.substring(1)}` ||
              "I had a spout issue with my model, run `fini spout` for the default fini spout"
          );
        }
      });
  } else {
    // Run old version
    // First we get a Setence to plug stuff into
    return db()
      .select<SentenceItem>("Sentences", "Random", interaction?.guildId || "")
      .then((results) => {
        if (results[0]) {
          // The sentence to spout
          let sentence = results[0].Item;
          // Count the occurences of placeholder tags so we knows how many to grab
          const numOfNouns = (sentence.match(/{n}/g) || []).length;
          const numOfPhrases = (sentence.match(/{p}/g) || []).length;

          // Grab the nouns and phrases
          const getNouns = db().select<HammerspaceItem>(
            "Hammerspace",
            "Random",
            interaction?.guildId || "",
            numOfNouns || 1
          );
          const getPhrases = db().select<PhraseItem>(
            "Phrase",
            "Random",
            interaction?.guildId || "",
            numOfPhrases || 1
          );

          // Run both SQL statements before proceeding
          Promise.all([getNouns, getPhrases]).then(
            ([HammerspaceRecords, PhraseRecords]) => {
              if (numOfNouns > 0) {
                HammerspaceRecords.forEach((hammerspaceRecord) => {
                  // Replace the occurence of {n} tags in the sentence
                  sentence = sentence.replace("{n}", hammerspaceRecord.Item);
                  // Update the number of times used for this hammerspace item
                  LogHammerspaceItem(
                    hammerspaceRecord?.ID || 0,
                    hammerspaceRecord.TimesUsed + 1,
                    interaction?.guildId || ""
                  );
                });
              }

              if (numOfPhrases > 0) {
                PhraseRecords.forEach((phraseRecord) => {
                  // Replace the occurence of a {p} tag in the sentence
                  sentence = sentence.replace("{p}", phraseRecord.Item);
                  // Update the number of times used for this phrase item
                  db().update(
                    "Phrase",
                    { Field: "ID", Value: phraseRecord?.ID || "" },
                    { Field: "TimesUsed", Value: phraseRecord.TimesUsed + 1 },
                    interaction?.guildId || ""
                  );
                });
              }

              interaction.reply(`*${sentence}*`);
            }
          );
        } else {
          // Nada
          interaction.reply("I couldn't find a sentence to spout it on out");
        }
      })
      .catch((err) => {
        interaction.reply(`I fucked up: ${err}`);
      });
  }
};
