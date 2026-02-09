import { AttachmentBuilder, Client, TextChannel } from "discord.js";
import {
  WeatherRecord,
  type ReminderRecord,
} from "../../types/PocketbaseTables";
import { pb } from "../../utilities/pocketbase";
import OpenAI from "openai";
import Replicate from "replicate";
import { splitBigString } from "../../utilities/splitBigString";
import { find } from "geo-tz";
import { syncAllSeasons } from "../finistocks/stockData";
import { ClientResponseError } from "pocketbase";
import { checkMonitoredServices } from "./monitoring";

export const runPollTasks = (cl: Client) => {
  checkReminders(cl);
  checkWeatherReports(cl);
  syncAndUpdateAnimeRecords();
  checkMonitoredServices(cl);
  // checkJobs(cl);
  // checkHealthPings(cl);
};

// #region Polling Jobs

// Ping the anime API to update stock data
const syncAndUpdateAnimeRecords = async () => {
  // Current time to check
  const now = new Date();
  // Check at midnight and noon every day
  if (
    (now.getHours() === 0 || now.getHours() === 12) &&
    now.getMinutes() === 0
  ) {
    await syncAllSeasons();
  }
};

// Check for jobs for me -- Disabled, as it didn't work as expected
// const checkJobs = async (cl: Client) => {
//   // Current time to check
//   const now = new Date();

//   console.log("Checking Job Postings...");

//   // Between 9am-5pm and on 30 min intervals
//   if (
//     now.getHours() > 9 &&
//     now.getHours() < 17 &&
//     now.getMinutes() % 30 === 0
//   ) {
//     // Wait a random delay (30s - 5min)
//     await new Promise((resolve) =>
//       setTimeout(resolve, Math.floor(Math.random() * 270000) + 30000)
//     );
//     // Get new jobs
//     const latestJobs = await fetchJobPostings();

//     if (latestJobs.length > 0) {
//       // Get bots channel
//       const gekinServer = await cl.guilds.fetch(
//         process.env.GEKIN_SERVERID ?? ""
//       );
//       const botChannel = (await gekinServer.channels.fetch(
//         "829091125234237440"
//       )) as TextChannel;

//       latestJobs.forEach(async (job) => {
//         await botChannel.send(`${process.env.LINK}${job.link}`);
//       });
//     }
//   }
// };

// Look for any reminders that were set by users
const checkReminders = async (cl: Client) => {
  // Current time to check
  const now = new Date().toISOString();

  // Pull out reminder records
  const reminderRecords = await pb
    .collection<ReminderRecord>("reminder")
    .getFullList({
      filter: `time < @now`,
    });

  reminderRecords.forEach(async (reminder) => {
    // Pull channel from client
    const channel: TextChannel = (await cl.channels.fetch(
      reminder.channel_id,
    )) as TextChannel;

    // Original reminder date
    const reminderDate = new Date(reminder.created!).toLocaleDateString();

    // Send the reminder
    await channel.send(
      `${reminder.original_message}\n<@${reminder.user_id}>, here is your reminder: ${reminder.reminder_text}`,
    );

    // Delete the reminder
    await pb.collection<ReminderRecord>("reminder").delete(reminder.id!);
  });
};

// Check for morning weather reports
const checkWeatherReports = async (cl: Client) => {
  // Current time to check
  const now = new Date();

  // 9 AM run the weather report
  if (now.getHours() === 9 && now.getMinutes() === 0) {
    try {
      const weatherRecords = await pb
        .collection<WeatherRecord>("weather")
        .getFullList();

      for (let i = 0; i < weatherRecords.length; i++) {
        const user = weatherRecords[i].user_id;

        // First grab the weather report
        const tomorrowResponse = await fetch(
          `https://api.tomorrow.io/v4/weather/forecast?location=${weatherRecords[i].city}&timesteps=1d&&units=imperial&apikey=${process.env.TOMORROW_WEATHER_API_KEY}`,
        );
        if (!tomorrowResponse.ok) {
          console.error("Error retrieving weather data", {
            weatherData: weatherRecords[i],
          });
          continue;
        }
        const weatherData = await tomorrowResponse.json();
        const todayWeatherData = weatherData?.timelines.daily?.[0]?.values;

        if (!todayWeatherData) {
          console.error("Error retrieving weather data");
          continue;
        }

        const lat = weatherData.location.lat;
        const long = weatherData.location.lon;
        const timezone = find(lat, long).at(0);

        // Get relevant bits of data
        const dewPoint = todayWeatherData.dewPointAvg;
        const humidity = todayWeatherData.humidityAvg;
        const rain = todayWeatherData.rainAccumulationAvg;
        const snow = todayWeatherData.snowAccumulationAvg;
        const sunrise = new Date(
          todayWeatherData.sunriseTime,
        ).toLocaleTimeString("en-US", { timeZone: timezone });
        const sunset = new Date(todayWeatherData.sunsetTime).toLocaleTimeString(
          "en-US",
          { timeZone: timezone },
        );
        const temperature = todayWeatherData.temperatureAvg;
        const temperatureFeelsLike = todayWeatherData.temperatureApparentAvg;
        const tempHigh = todayWeatherData.temperatureMax;
        const tempLow = todayWeatherData.temperatureMin;
        const uvIndex = todayWeatherData.uvIndexAvg;
        const visibility = todayWeatherData.visibilityAvg;
        const windGust = todayWeatherData.windGustAvg;
        const windSpeed = todayWeatherData.windSpeedAvg;

        const toCelsius = (tempF: number) => {
          return Math.round((5 / 9) * (tempF - 32)).toPrecision(2);
        };

        // Formatted to be readable
        const formattedData = {
          "High / Low": `High ${tempHigh} F (${toCelsius(
            tempHigh,
          )} C) | Low ${tempLow} F (${toCelsius(tempLow)} C)`,
          Temperature: `${temperature} F (${Math.round(
            (5 / 9) * (temperature - 32),
          ).toPrecision(2)} C)`,
          "Feels Like": `${temperatureFeelsLike} F (${Math.round(
            (5 / 9) * (temperatureFeelsLike - 32),
          ).toPrecision(2)} C)`,
          Humidity: `${humidity}% (Dew Point: ${dewPoint} F)`,
          Precipitation: rain,
          Snow: snow,
          "UV Index": uvIndex,
          "Sunrise & Sunset": `${sunrise} - ${sunset}`,
          Visibility: visibility,
          Wind: `${windSpeed} (Gust: ${windGust})`,
        };

        // Formatted for AI to understand
        const includedData = {
          Temperature: temperature,
          "Temperature (Celsius)": Math.round((5 / 9) * (temperature - 32)),
          "Feels like": temperatureFeelsLike,
          "Feels like (Celsius)": Math.round(
            (5 / 9) * (temperatureFeelsLike - 32),
          ),
          Humidity: humidity,
          "Dew Point": dewPoint,
          Rain: rain,
          Snow: snow,
          "UV Index": uvIndex,
          Sunrise: sunrise,
          Sunset: sunset,
          Visibility: visibility,
          "Wind Speed": windSpeed,
          "Wind Gust": windGust,
        };

        // Generate the opening message
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY || "no_key_found",
        });

        const openaiResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Given the data about today's weather, please generate 2 sentences summarizing what the weather might feel like. User will be provided with the full stats, your response will be supplemental to the data. Do not list data points. Ensure your response is well condensed to be easily readable. All units will be imperial. Today's Data: ${JSON.stringify(
                    includedData,
                  )}. ${
                    weatherRecords[i].additional_prompt
                      ? `Please generate an additional few sentences for this custom prompt: ${weatherRecords[i].additional_prompt}`
                      : ""
                  }`,
                },
              ],
            },
          ],
          max_tokens: 900,
        });

        if (!openaiResponse.choices.length) {
          console.error("OpenAI generation failed for weather report.");
          continue;
        }

        // Grab a random choice
        const rand = Math.round(
          Math.random() * (openaiResponse.choices.length - 1),
        );
        const randomChoice = openaiResponse.choices.at(rand);

        // Generate an image
        const replicate = new Replicate();
        const replicateResponse: any = await replicate.run(
          "black-forest-labs/flux-schnell",
          {
            input: {
              prompt: `A landscape depicting from the following description: ${JSON.stringify(
                randomChoice?.message.content,
              )}`,
              disable_safety_checker: true,
              safety_tolerance: 5,
              aspect_ratio: "16:9",
            },
          },
        );

        const imageAttachment = new AttachmentBuilder(
          replicateResponse[0] || "",
          {
            name: "image.jpg",
          },
        );

        // AI Summary Content
        const aiSummaryContent = `${
          randomChoice?.message.content ??
          "Error during weather report generation"
        }.`;

        const userDM = await (await cl.users.fetch(user)).createDM();

        // Combine message to single message
        const weatherDataPoints = Object.entries(formattedData)
          .map((e) => `- ${e.at(0)}: ${e.at(1)}`)
          .join("\n");
        const weatherReport = `---------------------------------------------------------------\r\n# ${now.toLocaleDateString()} Weather Report\r\n${weatherDataPoints}\r\n${aiSummaryContent}\r\n`;
        const weatherReportParts = splitBigString(weatherReport);

        // Send Weather report
        for (let i = 0; i < weatherReportParts.length; i++) {
          if (i === weatherReportParts.length - 1) {
            await userDM.send({
              files: [imageAttachment],
              content: weatherReportParts[i],
            });
          } else {
            await userDM.send({
              content: weatherReportParts[i],
            });
          }
        }

        // To prevent tomorrow.io rate limiting (and potentially other services too)
        await new Promise((resolve) => setTimeout(() => resolve(null), 750));
      }
    } catch (err) {
      console.error("Error when generating weather report.", err);
    }
  }
};

// Check for health reminders
//const checkHealthPings = async (cl: Client) => {
// const today = new Date();
// // Check at these times
// const hourToCheck = [10, 13, 16, 20];
// const minuteToCheck = 15;
// const currentHour = today.getHours();
// const currentMinute = today.getMinutes();
// if (currentMinute === minuteToCheck && hourToCheck.includes(currentHour)) {
//   console.log("===== Generate Health Message =====");
//   // Different prompts to use to help diversify the workout
//   const workoutPrompts = [
//     "Please provide a quick healthy activity I can do in my office in about a minute.",
//     "Please provide a short activity to get the blood pumping.",
//     "Please provide a short workout I can do in a small office space.",
//     "Please provide a helpful quick activity to improve posture, promote relaxation, etc.",
//     "Please provide a unique minute workout that one could perform in an office-like environment.",
//     "Please provide a short breathing exercise to help refresh me.",
//     "Please suggest a quick and easy stretch that can be done at my desk to relieve tension.",
//     "Please recommend a brief mental exercise to help reset and refocus during a busy day.",
//     "Please provide a simple office-friendly movement to engage core muscles and improve balance.",
//     "Please suggest a quick and calming technique for reducing stress in a busy work environment.",
//     "Please provide a short, creative exercise to boost energy and productivity in a limited space.",
//     "Please recommend a brief, office-friendly yoga pose to help improve flexibility and focus.",
//     "Please provide a quick self-massage technique to alleviate neck or shoulder tension.",
//     "Please suggest a short, dynamic exercise that can be done in a seated position to re-energize.",
//     "Please recommend a simple mindfulness activity to help regain clarity and calm during a hectic day.",
//     "Please provide a quick desk exercise to strengthen and tone lower body muscles in a limited space.",
//   ];
//   // get a random option
//   const rand = Math.round(Math.random() * (workoutPrompts.length - 1));
//   // combine to form final prompt
//   const prompt =
//     workoutPrompts[rand] +
//     " Please provide the activity in the form of a JSON object, with the keys being: 'activity_name', 'acitivity_description', 'acitivity_benefits'";
//   // Get the health message
//   const healthMessage = await chatWithUser("", prompt);
//   console.log({ healthMessage, JSONified: JSON.parse(healthMessage) });
//   try {
//     const activityJSON = JSON.parse(healthMessage);
//     // We have our health message
//     const channels = await db().select<SettingsRecord>("Settings", "All");
//     const filteredChannels = channels.filter((c) => c.Key === HEALTH_KEY);
//     filteredChannels.forEach(async (ch) => {
//       console.log("Looping through channels", { filteredChannels, ch });
//       const healthChannel = await cl.channels.fetch(ch?.Value);
//       (healthChannel as TextChannel).send(
//         `Friendly reminder to do something healthy!`
//       );
//       (healthChannel as TextChannel).send(
//         `**${activityJSON.activity_name}**`
//       );
//       (healthChannel as TextChannel).send(activityJSON.activity_description);
//     });
//   } catch (err) {
//     console.error("Error parsing openai response", {
//       err,
//       openaiResponse: healthMessage,
//     });
//   }
// }
//};

// #endregion
