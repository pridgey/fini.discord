const {
  getHealthySubscriptionWhitelist,
} = require("./../utilities/hammerspace");

const channelsLastUpdated = [];

const healthPing = (channel) => {
  console.log("Updated List", channelsLastUpdated);
  // Grab whitelisted chanels and then go nuts
  getHealthySubscriptionWhitelist().then((whitelistChannels) => {
    if (whitelistChannels?.includes(channel.id)) {
      // This is a valid channel to ping
      const current = Date.now();
      const hoursToWait = 4;

      // Check if this channel has been pinged more than 4 hours ago, or doesn't have a record in the system
      if (
        !channelsLastUpdated[channel.id] ||
        current >=
          channelsLastUpdated[channel.id] + 1000 * 60 * 60 * hoursToWait
      ) {
        // The possible messages
        const messages = [
          "relax your shoulders",
          "unclench your jaw",
          "check your posture",
          "release your tongue from the top of your mouth",
          "stare at something (not a screen) 20 feet away for 20 seconds",
          "tilt your head back and groan like chewbacca! It helps I swear",
          "stretch your arms and legs",
          "maybe do 10 jumping jacks",
          "take 3 deep breaths out of both nostrils",
          "drink water",
          "pester Josh",
          "call your mother",
          "say 'good bot'",
        ];

        // Update channel id's last update time
        channelsLastUpdated[channel.id] = current;

        // Finally send the message to the channel
        channel.send(
          `Friendly reminder to ${
            messages[Math.round(Math.random() * messages.length)]
          } :D`
        );
      }
    }
  });
};

module.exports = { healthPing };
