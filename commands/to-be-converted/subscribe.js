const {
  addHealthyChannel,
  removeHealthyChannel,
} = require("../../utilities/hammerspace");

const subscribe = (message, command) => {
  // Grab the params of the command, -r etc
  let params = command.split("fini subscribe")[1]?.split(" ");

  // "fini subscribe" | No additional params means add this channel to the whitelist
  // "fini subscribe -rm" | Remove this channel from the whitelist

  const channelID = message.channel.id;

  console.log("sub params", params);

  if (params?.includes("-h") || params?.includes("--help")) {
    message.channel.send(
      "This command controls this channels participation into simple health reminders. I will message every 4 hours, when there is user activity, with a simple reminder to drink water and check your posture :)"
    );
    message.channel.send(
      "`fini subscribe` will add this channel to the notifications"
    );
    message.channel.send(
      "`fini subscribe -rm` will remove this channel from the notifications"
    );
  } else if (params?.includes("-rm") || params?.includes("--remove")) {
    removeHealthyChannel(channelID).then(() => {
      message.channel.send(
        `I've removed ${message.channel.name} from my health notifications. :D`
      );
    });
  } else {
    addHealthyChannel(channelID).then(() => {
      message.channel.send(
        `I've added ${message.channel.name} to my periodic health notifications. :D`
      );
    });
  }
};

module.exports = { subscribe };
