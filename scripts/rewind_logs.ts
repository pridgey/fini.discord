import { LogRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import { writeFile } from "fs/promises";
import { format } from "date-fns";

const YEAR = 2024;
const SERVER_DICTIONARY = {
  gekin: "813622219569758258",
  lorgf: "1313711612527513680",
};
const SERVER_CHOICE = "gekin";
const SERVER = SERVER_DICTIONARY[SERVER_CHOICE];

const userIdMap = {
  "255016605191241729": "Pridgey",
  "294686904258134026": "Graham",
  "176771274318544897": "ImSoHm02",
  "239530279394476032": "GeekyLink",
  "651953795735224335": "Yoshi",
  "437713378455191564": "Lawwy",
  "306290472240939008": "Lucky",
  "1260813127973470238": "Pridgey",
  "96521824984129536": "Airwolf",
  "780953872289628160": "BreitIdea",
  "197190972487106560": "IcarusFountain",
  "807457299152371732": "Noche20",
  "604123133032660992": "SuzuStudios",
  "515983662995472385": "AyaHimura",
  "708078885375442964": "Bliss",
  "690401216102006794": "CharlesStJohn",
  "916889223020285952": "HurriKat7",
  "1138921518949212270": "JazzyEngineer",
  "637696484896145408": "RiddleMeTriscuits",
  "584062039383736339": "SalemScout",
  "468590988169052171": "Sleit",
  "189543182231404545": "Tabby",
};

const getData = async () => {
  console.log(`Running for ${YEAR} and server ${SERVER_CHOICE}...`);

  const data = await pb.collection<LogRecord>("log").getFullList({
    filter: `created > ${YEAR - 1} && created < ${
      YEAR + 1
    } && server_id = "${SERVER}"`,
  });

  console.log(`Query returned ${data.length} records.`);

  if (data.length > 0) {
    console.log("Extracting data to file...");

    // Header row
    let fileData = "user,created,command,input,output";

    // Transform each line to CSV
    data
      .filter((datum) => !!datum)
      .map((datum) => {
        if (!Object.hasOwn(userIdMap, datum.user_id)) {
          console.log(`${datum.user_id} has no matching dictionary username.`);
        }
        const user = userIdMap[datum.user_id] ?? datum.user_id;
        const created = datum.created
          ? format(datum.created, "MM/dd/yyyy HH:mm")
          : "";
        const command = datum.command;
        const input = datum.input.replaceAll('"', '""');
        const output = datum.input.replaceAll('"', '""');

        fileData += `\n${user},${created},${command},"${input}","${output}"`;
      });

    console.log("Creating CSV File...");

    await writeFile(`rewind-${YEAR}-${SERVER_CHOICE}.csv`, fileData);
    console.log(
      `File 'rewind-${YEAR}-${SERVER_CHOICE}.csv' created. Job complete.`
    );
  }
};

getData();
