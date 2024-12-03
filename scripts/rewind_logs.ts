import { LogRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import { writeFile } from "fs/promises";

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
  const data = await pb.collection<LogRecord>("log").getFullList({
    filter: `created > @yearStart && created < @yearEnd`,
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
        const user = userIdMap[datum.user_id] ?? datum.user_id;
        const created = datum.created;
        const command = datum.command;
        const input = datum.input.replaceAll('"', '""');
        const output = datum.input.replaceAll('"', '""');

        fileData += `\n${user},${created},${command},"${input}","${output}"`;
      });

    console.log("Creating CSV File...");

    await writeFile(`rewind-${new Date().getFullYear()}.csv`, fileData);
    console.log(
      `File 'rewind-${new Date().getFullYear()}.csv' created. Job complete.`
    );
  }
};

getData();
