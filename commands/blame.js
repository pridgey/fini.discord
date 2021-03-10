const { searchGekinzukuItems } = require("./../utilities/hammerspace");

const blame = (message, command) => {
  let target = command.split("fini blame")[1];

  searchGekinzukuItems(target)
    .then((item) => {
      if (item) {
        const dateMade = new Date(item.DateCreated);

        message.channel.send(
          `Hammerspace entry '${target.trim()}' was created by ${
            item.User
          } on ${dateMade.toLocaleDateString()} and has been used ${
            item.TimesUsed ?? 0
          } times`
        );
      } else {
        message.channel.send(
          `I couldn't find a hammerspace item for ${target}`
        );
      }
    })
    .catch((err) => console.log("fuck:", err));
};

module.exports = { blame };
