import { Database } from "sqlite3";
import { DatabaseTables, FieldValuePair } from "./../../../types";

export const select =
  (db: Database) =>
  <T>(
    SelectableItem: DatabaseTables,
    Count: "All" | "Random" | FieldValuePair = "All",
    Server: string,
    Limit: number = 1
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
              if (rows.length && "Item" in rows[0]) {
                rows.forEach((row) => {
                  row.Item = decodeURIComponent(row.Item);
                });
              }
              resolve(rows);
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
              if (!!row && "Item" in row) {
                row.Item = decodeURIComponent(row.Item);
              }
              resolve([row]);
            }
          }
        );
        // Select a specific record
      } else {
        db.get(
          `SELECT * FROM ("${SelectableItem}") WHERE ${
            Count.Field
          } LIKE "%${encodeURIComponent(
            Count.Value.toString()
          )}%" AND Server IN ("All", "${Server}")`,
          (error, row) => {
            if (error) {
              reject(error);
            } else {
              if (!!row && "Item" in row) {
                row.Item = decodeURIComponent(row.Item);
              }
              resolve([row]);
            }
          }
        );
      }
    });
