import { db } from "./../../../utilities/db";
import { SettingsRecord } from "./../../../types";
import { Message } from "discord.js";

const handleSubscription =
  (subscriptionType: string) => (message: Message, unsub: boolean) => {
    if (unsub) {
      return db()
        .remove<SettingsRecord>("Settings", {
          Field: "Key",
          Value: `${subscriptionType}_channels`,
        })
        .then(
          () =>
            `I've successfully unsubscribed this channel from ${subscriptionType} events`
        )
        .catch((err) => {
          return err;
        });
    } else {
      return db()
        .insert<SettingsRecord>("Settings", {
          Key: `${subscriptionType}_channels`,
          Value: encodeURIComponent(JSON.stringify(message.channel.id)),
          Server: message.guild.id,
        })
        .then(
          () =>
            `I've successfully subscribed this channel to ${subscriptionType} events`
        )
        .catch((err) => {
          return err;
        });
    }
  };

export const runSubscribe = (message: Message) => (args: string[]) => {
  const subscriptions: {
    [key: string]: (message: Message, unsub: boolean) => Promise<string>;
  } = {
    jackpot: handleSubscription("jackpot"),
  };

  if (args[0] in subscriptions) {
    return subscriptions[args[0]](
      message,
      ["-d", "-u", "-unsubscribe"].includes(args[1])
    );
  } else {
    return new Promise<string>((resolve) =>
      resolve(
        `That doesn't look right\nHere's the subscribe command: \`fini subscribe {${Object.keys(
          subscriptions
        ).join("|")}} -d,-u,-unsubscribe\``
      )
    );
  }
};
