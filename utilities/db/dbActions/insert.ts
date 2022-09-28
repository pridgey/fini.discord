import { Database } from "sqlite3";
import { DatabaseTables } from "./../../../types";

export const insert =
  (db: Database) =>
  <T>(InsertableItem: DatabaseTables, Record: T): Promise<string> =>
    new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO ${InsertableItem} (${Object.keys(Record as Object).join(
          ", "
        )}) VALUES ("${Object.values(Record as Object)
          .map((value) => encodeURIComponent(value).trim())
          .join(`", "`)}")`,
        (result, error) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
    });
