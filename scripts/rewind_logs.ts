import { LogRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import { writeFile } from "fs/promises";
import { format } from "date-fns";

const YEAR = 2024;

const userIdMap = {
  "255016605191241729": "Pridgey",
  "294686904258134026": "Graham",
  "176771274318544897": "ImSoHm02",
  "239530279394476032": "GeekyLink",
  "651953795735224335": "Yoshi",
  "437713378455191564": "Lawwy",
  "306290472240939008": "Lucky",
  "1260813127973470238": "Pridgey",
};

const getData = async () => {
  console.log(`Running for ${YEAR}`);

  const data = await pb.collection<LogRecord>("log").getFullList({
    filter: `created > ${YEAR - 1} && created < ${
      YEAR + 1
    } && server_id = "813622219569758258"`,
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

    await writeFile(`rewind-${YEAR}.csv`, fileData);
    console.log(`File 'rewind-${YEAR}.csv' created. Job complete.`);
  }
};

getData();
