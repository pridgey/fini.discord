import { Message } from "discord.js";
import { StatsRecord } from "./../../../types";
import { db } from "./../../../utilities";
import { getStatistics } from "./../../../modules";

export const runStats = (message: Message) => (args: string[]) => {
  // Determine the item we're looking up via the args
  const statsCollection: string = args.join(" ");

  if (statsCollection.length) {
    return getStatistics(statsCollection, message.guild.id).then((stats) => {
      if (stats.length) {
        let reply = `Statistics for _${statsCollection}_:\n`;
        stats.forEach(
          (stat) => (reply += `**${stat.Field}**: ${stat.Value}\n`)
        );
        return reply;
      } else {
        return `I couldn't find any stats matching _${statsCollection}_`;
      }
    });
  } else {
    return db()
      .select<StatsRecord>("Stats", "All", message.guild.id)
      .then((results) => results.map((stat) => stat.Collection))
      .then((collections) => {
        let reply = `Available Statistics:\n`;
        const unique = Array.from(new Set(collections));
        unique.forEach((collect) => (reply += `-${collect}\n`));
        return reply;
      });
  }
};
