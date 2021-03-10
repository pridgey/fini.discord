const {
  getMultipleGekinzukuItems,
  updateGekinStat,
  getMultiplePhrases,
  getRandomSentence,
} = require("./../utilities/hammerspace");

const spout = (message, command) => {
  getRandomSentence().then((sentence) => {
    const countNouns = (sentence.match(/{n}/g) || []).length;
    const countPhrases = (sentence.match(/{n}/g) || []).length;

    const phrasePromise = getMultiplePhrases(countPhrases);
    const nounPromise = getMultipleGekinzukuItems(countNouns);

    Promise.all([phrasePromise, nounPromise]).then((values) => {
      // Update noun stats
      if (values[1].length) {
        values[1].forEach((noun) => {
          updateGekinStat(noun);
        });
      }

      // Iterate through the sentence for noun placeholders
      while (sentence.includes("{n}")) {
        if (!sentence.includes("{n}")) {
          break;
        }
        sentence = sentence.replace("{n}", values[1][0].trim().toLowerCase());
        values[1].shift();
      }

      // Iterate through the sentence for phrase placeholders
      while (sentence.includes("{p}")) {
        if (!sentence.includes("{p}")) {
          break;
        }
        sentence = sentence.replace("{p}", values[0][0].trim().toLowerCase());
        values[0].shift();
      }

      // Send the message
      message.channel.send(`*${sentence}*`);
    });
  });
};

module.exports = { spout };
