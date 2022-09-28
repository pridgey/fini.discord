import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, MessageEmbed } from "discord.js";
import { DateTime } from "ts-luxon";

const hours = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24,
];
const minutes = ["00", "15", "30", "45", "60"];

const acceptedTimeZones = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Guayaquil",
  "Australia/Canberra",
];

export const data = new SlashCommandBuilder()
  .setName("time")
  .setDescription("Convert Time across Timezones")
  .addNumberOption((opt) => {
    opt
      .setName("hour")
      .setDescription("The Hour you want converted")
      .setRequired(true);

    hours.forEach((h) => {
      opt.addChoice(h.toString(), h);
    });
    return opt;
  })
  .addStringOption((opt) => {
    opt
      .setName("minute")
      .setDescription("The Minutes you want converted")
      .setRequired(true);

    minutes.forEach((m) => {
      opt.addChoice(m.toString(), m);
    });
    return opt;
  })
  .addStringOption((opt) => {
    opt.setName("timezone").setDescription("Your timezone").setRequired(true);

    acceptedTimeZones.forEach((t) => {
      opt.addChoice(t, t);
    });
    return opt;
  });

export const execute = async (interaction: CommandInteraction) => {
  const hours = interaction.options.getNumber("hour");
  const minutes = interaction.options.getString("minute");
  const timezone = interaction.options.getString("timezone");

  const date = DateTime.fromISO(
    `${DateTime.now().year}-01-15T${hours}:${minutes}:00`,
    { zone: timezone || "" }
  );
  const results: any[] = [];

  acceptedTimeZones.forEach((tz) => {
    const tzdate = date.setZone(tz);
    console.log({
      tz: tzdate.day,
      da: date.day,
    });
    const dayDiff = tzdate.day - date.day;
    const addPlus = dayDiff >= 0;
    let appendText = "";
    if (dayDiff !== 0) {
      if (addPlus) {
        appendText += "+";
      }
      appendText += `${dayDiff} day${dayDiff > 1 ? "s" : ""}`;
    }
    results.push({
      place: tz?.split("/")?.[1]?.replace("_", " ") || "",
      time: tzdate?.toFormat("HH:mm") || "",
      append: appendText || "",
    });
  });

  interaction.reply({
    embeds: results.map((r) => {
      const embed = new MessageEmbed();
      embed.addField(r.place, r.time);
      if (r.append) {
        embed.setFooter({
          text: r.append,
        });
      }
      return embed;
    }),
  });
};
