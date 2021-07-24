import { Database } from "sqlite3";

export const select =
  (db: Database) =>
  <T>(
    SelectableItem:
      | "Bank"
      | "Hammerspace"
      | "Phrase"
      | "Sentences"
      | "Settings",
    Count: "All" | "Random" | { field: string; value: string | number } = "All",
    Server: string
  ): Promise<T[]> =>
    new Promise((resolve, reject) => {
      // Select All of the records
      if (Count === "All") {
        db.all(
          `SELECT * FROM ("${SelectableItem}") WHERE Server IN ("All", "${Server}")`,
          (error, rows) => {
            if (error) {
              reject(error);
            } else {
              // Convert to correct types?
              resolve(rows);
            }
          }
        );
        // Select a random record
      } else if (Count === "Random") {
        db.get(
          `SELECT * FROM ("${SelectableItem}") WHERE Server IN ("All", "${Server}") ORDER BY random() LIMIT 1`,
          (error, row) => {
            if (error) {
              reject(error);
            } else {
              // do stuff
              resolve([row]);
            }
          }
        );
        // Select a specific record
      } else {
        db.get(
          `SELECT * FROM ("${SelectableItem}") WHERE ${Count.field} = "${Count.value}" AND Server IN ("All", "${Server}")`,
          (error, row) => {
            if (error) {
              reject(error);
            } else {
              resolve([row]);
            }
          }
        );
      }
    });
