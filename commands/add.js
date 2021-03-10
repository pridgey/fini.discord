const {
  addGekinzukuItem,
  searchGekinzukuItems,
} = require("./../utilities/hammerspace");

const add = (message, command) => {
  let target = command.split("fini add")[1];

  if (target.length > 100) {
    message.channel.send(
      "I'm *way* too lazy to add all of that into the hammerspace"
    );
  } else {
    searchGekinzukuItems(target)
      .then((result) => {
        if (!!result) {
          // Item already exists
          message.channel.send(
            `Well shit. It looks like ${target.trim()} is already in the hammerspace. ${result.User.trim()} added it already.`
          );
        } else {
          addGekinzukuItem(target, message.author.username)
            .then(() => {
              message.channel.send(
                `I've added ${target.trim()} to the hammerspace`
              );
            })
            .catch((err) => console.log("Fuck:", err));
        }
      })
      .catch((err) => console.log("fuck", err));
  }
};

module.exports = { add };
