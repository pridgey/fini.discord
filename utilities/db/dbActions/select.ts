import { Database } from "sqlite3";
import { DatabaseTables, FieldValuePair } from "./../../../types";

export const select =
  (db: Database) =>
  <T>(
    SelectableItem: DatabaseTables,
    Count: "All" | "Random" | FieldValuePair<T> = "All",
    Server?: string,
    Limit: number = 1
  ): Promise<T[]> =>
    new Promise((resolve, reject) => {
      // Select All of the records
      if (Count === "All") {
        db.all(
          `SELECT * FROM ("${SelectableItem}") ${
            Server ? ` WHERE Server IN ("All", "${Server}")` : ""
          }`,
          (error, rows) => {
            if (error) {
              reject(error);
            } else {
              if (rows.length) {
                rows.forEach((record: any) => {
                  // One item of the results
                  const values: any[] = Object.values(record);
                  Object.keys(record).forEach(
                    (key, index) =>
                      (record[key] = decodeURIComponent(values[index]))
                  );
                });
              }
              resolve(rows as T[]);
            }
          }
        );
        // Select a random record
      } else if (Count === "Random") {
        db.get(
          `SELECT * FROM ("${SelectableItem}") WHERE Server IN ("All", "${Server}") ORDER BY random() LIMIT ${Limit}`,
          (error, row) => {
            if (error) {
              reject(error);
            } else {
              if (!!row) {
                const values: any[] = Object.values(row);
                Object.keys(row).forEach(
                  (key, index) => (row[key] = decodeURIComponent(values[index]))
                );
              }
              resolve([row as T]);
            }
          }
        );
        // Select a specific record
      } else {
        db.get(
          `SELECT * FROM ("${SelectableItem}") WHERE ${String(
            Count.Field
          )} LIKE "%${encodeURIComponent(
            Count.Value.toString()
          )}%" AND Server IN ("All", "${Server}")`,
          (error, row) => {
            if (error) {
              reject(error);
            } else {
              if (!!row) {
                const values: any[] = Object.values(row);
                Object.keys(row).forEach(
                  (key, index) => (row[key] = decodeURIComponent(values[index]))
                );
              }
              resolve([row as T]);
            }
          }
        );
      }
    });
