import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, MessageEmbed, TextChannel } from "discord.js";
import { db } from "./../utilities";
import { FeedsRecord } from "./../types";
import Parser from "rss-parser";

export const data = new SlashCommandBuilder()
  .setName("feed")
  .setDescription("Retrieve or manage your RSS Feed")
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add new RSS feed to your daily")
      .addStringOption((opt) =>
        opt
          .setName("rss-url")
          .setDescription("The URL for the RSS feed")
          .setRequired(true)
      )
      .addNumberOption((opt) =>
        opt
          .setName("number")
          .setDescription(
            "The number of items from this feed to display in your report"
          )
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("See your current RSS feeds")
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Delete an RSS feed from your report")
      .addStringOption((opt) =>
        opt
          .setName("rss-url")
          .setDescription("The URL of the feed you want to delete")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("run")
      .setDescription("Fetch the latest RSS items and generate a report")
  );

export const execute = async (interaction: CommandInteraction) => {
  const subcommand = interaction.options.getSubcommand();

  const commandDictionary = {
    add,
    list,
    remove,
    run,
  };

  commandDictionary[subcommand](interaction);
};

const add = (interaction: CommandInteraction) => {
  const feedUrl = interaction.options.getString("rss-url");
  const numItems = interaction.options.getNumber("number");

  db()
    .select<FeedsRecord>("Feeds", "All", interaction?.guildId || "")
    .then((results) => {
      // Look through the results and see if we have this one already
      if (
        results.some(
          (rec) =>
            rec.URL === feedUrl &&
            rec.User === interaction.user.id &&
            rec.Server === interaction.guildId
        )
      ) {
        // It already exists
        interaction.reply(
          `It looks like this item (${feedUrl}) already is in your feed`
        );
      } else {
        // Brand new
        db()
          .insert<FeedsRecord>("Feeds", {
            Items: numItems || 0,
            Server: interaction.guildId || "",
            URL: feedUrl || "",
            User: interaction.user.id || "",
          })
          .then(() =>
            interaction.reply(
              `Your feed will now display ${numItems} items from the ${feedUrl} RSS stream.`
            )
          );
      }
    });
};

const list = (interaction: CommandInteraction) => {
  db()
    .select<FeedsRecord>("Feeds", "All", interaction?.guildId || "")
    .then((results: FeedsRecord[]) => {
      const userFeeds = results.filter(
        (feed) => feed.User === interaction.user.id
      );

      const embed = new MessageEmbed()
        .setTitle(`${interaction.user.username}'s RSS Feeds`)
        .addFields(
          ...userFeeds.map((feed) => ({
            name: `${feed.Items.toString()} items from:`,
            value: feed.URL,
          }))
        );

      interaction.reply({
        embeds: [embed],
      });
    });
};

const remove = (interaction: CommandInteraction) => {
  const urlToDelete = interaction.options.getString("rss-url");

  db()
    .select<FeedsRecord>("Feeds", "All", interaction?.guildId || "")
    .then((results: FeedsRecord[]) => {
      const feedToDelete = results.filter(
        (feed) => feed.URL === urlToDelete && feed.User === interaction.user.id
      )[0];

      if (!feedToDelete) {
        interaction.reply(
          `I couldn't find an RSS Feed in your list by the URL ${urlToDelete}.\nRun \`/feed list\` to see the feeds you have saved`
        );
      } else {
        db()
          .remove<FeedsRecord>("Feeds", {
            Field: "ID",
            Value: feedToDelete.ID || "",
          })
          .then(() => {
            interaction.reply(
              `I've successfully removed the feed with the RSS URL ${urlToDelete}`
            );
          });
      }
    });
};

const run = (interaction: CommandInteraction) => {
  db()
    .select<FeedsRecord>("Feeds", "All", interaction?.guildId || "")
    .then((feeds) => {
      // Extract the current user's feeds
      const userFeeds = feeds.filter(
        (feed) => feed.User === interaction.user.id
      );

      const parser = new Parser();
      const feedCollection: any[] = [];
      userFeeds.forEach((userFeed) =>
        feedCollection.push(parser.parseURL(userFeed.URL))
      );

      Promise.all(feedCollection).then((feedResults) => {
        const resultingURLs: any[] = [];

        feedResults.forEach((feed, index) => {
          // Only grab the number of items we specified
          for (let i = 0; i < userFeeds[index].Items; i++) {
            Object.values(feed.items[i]).forEach((val) => {
              // Grab anything that looks like a URL
              if (
                val?.toString().includes("http") &&
                !val.toString().includes(" ")
              ) {
                resultingURLs.push(val || "");
              }
            });
          }
        });

        if (interaction?.channel?.type === "GUILD_TEXT") {
          (interaction.channel as TextChannel).threads
            .create({
              name: `${interaction.user.username}-feed`,
              autoArchiveDuration: 60,
            })
            .then((feed) => {
              // De-dup the array and pump shit out
              Array.from(new Set([...resultingURLs])).forEach((url) =>
                setTimeout(() => feed.send(url), 1500)
              );
              interaction.reply("Making the feed thread...");
            });
        }
      });
    });
};
