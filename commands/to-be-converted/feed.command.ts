// import { SlashCommandBuilder } from "@discordjs/builders";
// import {
//   Channel,
//   Client,
//   CommandInteraction,
//   MessageEmbed,
//   TextChannel,
//   User,
// } from "discord.js";
// import { db } from "../../utilities";
// import { FeedsRecord, FeedItemRecord } from "../../types";
// import Parser from "rss-parser";

// export const data = new SlashCommandBuilder()
//   .setName("feed")
//   .setDescription("Retrieve or manage your RSS Feed")
//   .addSubcommand((sub) =>
//     sub
//       .setName("add")
//       .setDescription("Add new RSS feed to your daily")
//       .addStringOption((opt) =>
//         opt
//           .setName("rss-url")
//           .setDescription("The URL for the RSS feed")
//           .setRequired(true)
//       )
//       .addNumberOption((opt) =>
//         opt
//           .setName("number")
//           .setDescription(
//             "The number of items from this feed to display in your report"
//           )
//           .setRequired(true)
//       )
//   )
//   .addSubcommand((sub) =>
//     sub.setName("list").setDescription("See your current RSS feeds")
//   )
//   .addSubcommand((sub) =>
//     sub
//       .setName("remove")
//       .setDescription("Delete an RSS feed from your report")
//       .addStringOption((opt) =>
//         opt
//           .setName("rss-url")
//           .setDescription("The URL of the feed you want to delete")
//           .setRequired(true)
//       )
//   )
//   .addSubcommand((sub) =>
//     sub
//       .setName("run")
//       .setDescription("Fetch the latest RSS items and generate a report")
//   );

// export const execute = async (interaction: CommandInteraction) => {
//   const subcommand = interaction.options.getSubcommand();

//   const commandDictionary = {
//     add,
//     list,
//     remove,
//     run,
//   };

//   commandDictionary[subcommand](interaction);
// };

// const add = (interaction: CommandInteraction) => {
//   const feedUrl = interaction.options.getString("rss-url");
//   const numItems = interaction.options.getNumber("number");

//   db()
//     .select<FeedsRecord>("Feeds", "All", interaction?.guildId || "")
//     .then((results) => {
//       // Look through the results and see if we have this one already
//       if (
//         results.some(
//           (rec) =>
//             rec.URL === feedUrl &&
//             rec.User === interaction.user.id &&
//             rec.Server === interaction.guildId
//         )
//       ) {
//         // It already exists
//         interaction.reply(
//           `It looks like this item (${feedUrl}) already is in your feed`
//         );
//       } else {
//         // Brand new
//         db()
//           .insert<FeedsRecord>("Feeds", {
//             Items: numItems || 0,
//             Server: interaction.guildId || "",
//             URL: feedUrl || "",
//             User: interaction.user.id || "",
//             Channel: interaction.channelId || "",
//           })
//           .then(() =>
//             interaction.reply(
//               `Your feed will now display ${numItems} items from the ${feedUrl} RSS stream.`
//             )
//           );
//       }
//     });
// };

// const list = (interaction: CommandInteraction) => {
//   db()
//     .select<FeedsRecord>("Feeds", "All", interaction?.guildId || "")
//     .then((results: FeedsRecord[]) => {
//       const userFeeds = results.filter(
//         (feed) => feed.User === interaction.user.id
//       );

//       const embed = new MessageEmbed()
//         .setTitle(`${interaction.user.username}'s RSS Feeds`)
//         .addFields(
//           ...userFeeds.map((feed) => ({
//             name: `${feed.Items.toString()} items from:`,
//             value: feed.URL,
//           }))
//         );

//       interaction.reply({
//         embeds: [embed],
//       });
//     });
// };

// const remove = (interaction: CommandInteraction) => {
//   const urlToDelete = interaction.options.getString("rss-url");

//   db()
//     .select<FeedsRecord>("Feeds", "All", interaction?.guildId || "")
//     .then((results: FeedsRecord[]) => {
//       const feedToDelete = results.filter(
//         (feed) => feed.URL === urlToDelete && feed.User === interaction.user.id
//       )[0];

//       if (!feedToDelete) {
//         interaction.reply(
//           `I couldn't find an RSS Feed in your list by the URL ${urlToDelete}.\nRun \`/feed list\` to see the feeds you have saved`
//         );
//       } else {
//         db()
//           .remove<FeedsRecord>("Feeds", {
//             Field: "ID",
//             Value: feedToDelete.ID || "",
//           })
//           .then(() => {
//             interaction.reply(
//               `I've successfully removed the feed with the RSS URL ${urlToDelete}`
//             );
//           });
//       }
//     });
// };

// export const run = async (
//   interaction?: CommandInteraction,
//   discordClient?: Client
// ) => {
//   // Grab the user's feeds from the DB
//   const feeds = await db().select<FeedsRecord>("Feeds", "All");

//   // Define function for parsing and posting of feed records
//   const parseAndPostFeeds = async (
//     feeds: FeedsRecord[],
//     channel: Channel,
//     user: User
//   ) => {
//     // A partial type for the results from the parser
//     type FeedItemProps = {
//       title?: string;
//       link?: string;
//     };
//     // Type of the results parsed feeds
//     type FeedResultProps = {
//       items: FeedItemProps[];
//     };

//     // The parser that will break the RSS feed into items
//     const parser = new Parser();
//     // An array of promises for each feed in the user's list
//     const feedCollection: Promise<FeedResultProps>[] = [];

//     // Parse each feed in this collection and add it to our array
//     feeds.forEach((feed) => feedCollection.push(parser.parseURL(feed.URL)));

//     // Run all the promises
//     const feedResults = await Promise.all(feedCollection);

//     // Only continue if we have results to use
//     if (feedResults.length) {
//       // An array of articles we will gather from the feeds
//       const resultingArticles: FeedItemProps[] = [];

//       // Loop through all of the parsed feeds
//       feedResults.forEach(async (feed, currentFeedIndex) => {
//         // The number of records to grab from this feed
//         const itemsToDisplay = feeds[currentFeedIndex].Items;

//         // Only grab that many items, we could slice the array, but we need to transform it
//         for (let itemNumber = 0; itemNumber < itemsToDisplay; itemNumber++) {
//           // Grab the item from the feed's array of items
//           const feedItem = feed.items[itemNumber];

//           // If the feed has a title and a link, we want it
//           if (feedItem?.title && feedItem?.link) {
//             // Select all "cached" articles in the database
//             const cachedItems = await db().select<FeedItemRecord>(
//               "FeedItem",
//               "All"
//             );

//             // Ensure we haven't shown this item already
//             if (
//               !cachedItems.some(
//                 (ci) => ci.Title === feedItem.title && ci.User === user.id
//               )
//             ) {
//               // Can't find it, cool let's show it
//               resultingArticles.push({
//                 title: feedItem.title,
//                 link: feedItem.link,
//               });

//               // Also add it to the database so we don't show it again
//               db().insert<FeedItemRecord>("FeedItem", {
//                 DateCreated: new Date().toUTCString(),
//                 Title: feedItem.title,
//                 URL: feedItem.link,
//                 User: user.id,
//               });
//             }
//           }
//         } // end for
//       }); //end forEach

//       // Create Feed thread title text
//       const todayText = new Intl.DateTimeFormat("en", {
//         weekday: "long",
//         month: "short",
//         day: "numeric",
//       }).format(new Date());

//       // Make sure channel is a text type, so it can accept messages
//       if (channel?.type === "GUILD_TEXT") {
//         // Archive old feeds from this channel
//         const channelThreads = await (channel as TextChannel).threads.fetch();

//         // Loop through each thread in the channel and try to delete it or archive it
//         channelThreads.threads.forEach(async (thread) => {
//           if (thread.archived) {
//             await thread.delete();
//           } else {
//             await thread.setArchived(true);
//           }
//         });

//         // Create a new thread for this run
//         const newThread = await (channel as TextChannel).threads.create({
//           name: `${user.username}'s feed for ${todayText}`,
//           autoArchiveDuration: 60,
//         });

//         // De-dupe the results array
//         const uniqueResults = Array.from(new Set([...resultingArticles]));

//         // List articles in array
//         uniqueResults.forEach(async (article) => {
//           setTimeout(() => newThread.send(article.link!), 1000); // hoping to not need timeout with await
//         });
//       }
//     }
//   };

//   if (interaction) {
//     // Looks like we are running feeds for a particular user
//     const userFeeds = feeds.filter((feed) => feed.User === interaction.user.id);

//     // Run the feeds
//     parseAndPostFeeds(
//       userFeeds,
//       interaction.channel as Channel,
//       interaction.user
//     );
//     // Reply to the interaction
//     interaction.reply("Generating the Feeds for you");
//   } else {
//     // We are running all feeds, grouped by user
//     const users = Array.from(new Set(feeds.map((feed) => feed.User)));

//     // Loop through users and generate feeds for each user in the array
//     users.forEach(async (user) => {
//       // Get this user's feeds
//       const usersFeeds = feeds.filter((feed) => feed.User === user);

//       // We need the channel to use
//       const channelID = usersFeeds[0]?.Channel || "";
//       // UserID
//       const userID = user || "";

//       // Setup promises to get the user and channel objects attached to the feed record
//       const getChannel = discordClient?.channels.fetch(channelID);
//       const getUser = discordClient?.users.fetch(userID);

//       // Fetch channel and user
//       const [channel, userData] = await Promise.all([getChannel, getUser]);

//       // Parse and Post
//       parseAndPostFeeds(usersFeeds, channel as Channel, userData!);
//     });
//   }
// };
