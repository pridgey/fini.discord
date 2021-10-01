import { db } from "./../../../utilities/db";
import { FeedsRecord } from "./../../../types";
import { Message, TextChannel } from "discord.js";
import Parser from "rss-parser";

type FeedItem = {
  Title: string;
  URL: string;
  Snippet: string;
};

export const runFeed = (message: Message) => (args: string[]) =>
  new Promise<string>((resolve) => {
    if (args.length && args[0] === "add") {
      // Add Mode
      if (args.join(" ").match(/add .+ \d/)) {
        db()
          .select<FeedsRecord>("Feeds", "All", message.guild.id)
          .then((results) => {
            // Look through the results and see if we have this one already
            if (
              results.some(
                (rec) =>
                  rec.URL === args[1] &&
                  rec.User === message.author.id &&
                  rec.Server === message.guild.id
              )
            ) {
              // It already exists
              resolve(
                `It looks like this item (${args[1]}) already is in your feed`
              );
            } else {
              // Brand new
              db()
                .insert<FeedsRecord>("Feeds", {
                  Items: Number(args[2]),
                  Server: message.guild.id,
                  URL: args[1],
                  User: message.author.id,
                })
                .then(() =>
                  resolve(
                    `Your feed will now display ${args[2]} items from the ${args[1]} RSS stream.`
                  )
                );
            }
          });
      } else {
        resolve(
          "Incorrect arguments. `Feed Add` expects a url, and number of items to display. Such as `fini feed add https://pridgey.dev/feed 4"
        );
      }
    } else {
      // Feed Mode
      db()
        .select<FeedsRecord>("Feeds", "All", message.guild.id)
        .then((feeds) => {
          // Extract the current user's feeds
          const userFeeds = feeds.filter(
            (feed) => feed.User === message.author.id
          );

          const parser = new Parser();
          const feedCollection = [];
          userFeeds.forEach((userFeed) =>
            feedCollection.push(parser.parseURL(userFeed.URL))
          );

          Promise.all(feedCollection).then((feedResults) => {
            const resultingURLs = [];

            feedResults.forEach((feed, index) => {
              // Only grab the number of items we specified
              for (let i = 0; i < userFeeds[index].Items; i++) {
                Object.values(feed.items[i]).forEach((val) => {
                  // Grab anything that looks like a URL
                  if (
                    val.toString().includes("http") &&
                    !val.toString().includes(" ")
                  ) {
                    resultingURLs.push(val);
                  }
                });
              }
            });

            if (message.channel.type === "GUILD_TEXT") {
              (message.channel as TextChannel).threads
                .create({
                  name: `${message.author.username}-feed`,
                  autoArchiveDuration: 60,
                })
                .then((feed) => {
                  // De-dup the array and pump shit out
                  Array.from(new Set([...resultingURLs])).forEach((url) =>
                    setTimeout(() => feed.send(url), 1500)
                  );
                  resolve("Done");
                });
            }
          });
        });
    }
  });
