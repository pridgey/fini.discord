import { db } from "./../../utilities/db";
import { StatsRecord } from "./../../types";

export const getStatistics = (Collection: string, Server: string) =>
  db()
    .select<StatsRecord>("Stats", "All", Server)
    .then((results: StatsRecord[]) => {
      if (results[0]) {
        const relevantResults = results.filter(
          (stat) => stat.Collection === Collection && stat.Server === Server
        );
        if (relevantResults[0]) {
          return relevantResults;
        }
      }
      return [];
    });

export const updateStats = (
  Collection: string,
  Server: string,
  Key: string,
  NewValue: string
) =>
  getStatistics(Collection, Server).then((availableResults) => {
    const IDToUpdate =
      availableResults?.find(
        (stat) => stat.Field === Key && stat.Collection === Collection
      )?.ID ?? -1;

    if (IDToUpdate > -1) {
      // The fields exist, so update
      db()
        .update<StatsRecord>(
          "Stats",
          {
            Field: "ID",
            Value: IDToUpdate,
          },
          {
            Field: "Value",
            Value: NewValue,
          },
          Server
        )
        .catch((err) => console.log(`We dying out here: ${err}`));
    } else {
      // Doesn't seem to be here, let's make it
      db().insert<StatsRecord>("Stats", {
        Collection,
        Field: Key,
        Server,
        Value: NewValue,
      });
    }
  });
