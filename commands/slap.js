const {
  getRandomCollection,
  getHammerspaceItem,
  getGekinzukuItem,
  updateGekinStat,
} = require("./../utilities/hammerspace");

const buildSlap = (noun, target) => {
  let slapMessage = "**Fini slaps {0}{1} with {2}**";

  slapMessage = slapMessage.replace(
    "{0}",
    Math.random() > 0.15 ? "" : "the shit out of "
  );

  slapMessage = slapMessage.replace("{1}", target.trim());

  slapMessage = slapMessage.replace("{2}", noun);

  updateGekinStat(noun);

  return slapMessage;
};

const slap = (message, command) => {
  // Determine if plural or not
  let plural = Math.round(Math.random()) === 0 ? true : false;
  // Setup first promise
  let phrase = getHammerspaceItem(plural ? "multiple" : "singular");
  // Setup second promise
  let collection = getRandomCollection();

  let target = command.split("fini slap")[1];
  if (!target.length) {
    target = message.author.username;
  }

  if (message.guild.id === "813622219569758258") {
    getGekinzukuItem().then((noun) => {
      message.channel.send(buildSlap(noun, target));
    });
  } else {
    Promise.all([phrase, collection]).then((values) => {
      let phrase = "";

      if (plural) {
        phrase = `${values[1]} ${value[0]}`;
      } else {
        phrase = `${values[0]}`;
      }

      message.channel.send(buildSlap(phrase, target));
    });
  }
};

module.exports = { slap };
