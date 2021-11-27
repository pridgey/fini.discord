import { db } from "./../../../utilities/db";
import { HammerspaceItem, SentenceItem, PhraseItem } from "./../../../types";
import { Message } from "discord.js";

export const runSpout = (message: Message) => () => {
  // First we get a Setence to plug stuff into
  return db()
    .select<SentenceItem>("Sentences", "Random", message.guild.id)
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
          message.guild.id,
          numOfNouns || 1
        );
        const getPhrases = db().select<PhraseItem>(
          "Phrase",
          "Random",
          message.guild.id,
          numOfPhrases || 1
        );

        // Run both SQL statements before proceeding
        return Promise.all([getNouns, getPhrases]).then(
          ([HammerspaceRecords, PhraseRecords]) => {
            if (numOfNouns > 0) {
              HammerspaceRecords.forEach((hammerspaceRecord) => {
                // Replace the occurence of {n} tags in the sentence
                sentence = sentence.replace("{n}", hammerspaceRecord.Item);
                // Update the number of times used for this hammerspace item
                db().update(
                  "Hammerspace",
                  { Field: "ID", Value: hammerspaceRecord.ID },
                  {
                    Field: "TimesUsed",
                    Value: hammerspaceRecord.TimesUsed + 1,
                  },
                  message.guild.id
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
                  { Field: "ID", Value: phraseRecord.ID },
                  { Field: "TimesUsed", Value: phraseRecord.TimesUsed + 1 },
                  message.guild.id
                );
              });
            }

            return `*${sentence}*`;
          }
        );
      } else {
        // Nada
        return new Promise<string>((resolve) =>
          resolve("I couldn't find a sentence to spout it on out")
        );
      }
    })
    .catch((err) => {
      return `I fucked up: ${err}`;
    });
};
