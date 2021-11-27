import { Database } from "sqlite3";
import { DatabaseTables, FieldValuePair } from "./../../../types";

export const update =
  (db: Database) =>
  <T>(
    UpdatableItem: DatabaseTables,
    CurrentValue: FieldValuePair,
    NewValue: FieldValuePair,
    Server: string
  ): Promise<T[]> =>
    new Promise((resolve, reject) => {
      db.run(
        `UPDATE ${UpdatableItem} SET ${NewValue.Field} = ${encodeURIComponent(
          NewValue.Value
        )} WHERE ${CurrentValue.Field} = "${encodeURIComponent(
          CurrentValue.Value
        )}" AND Server IN ("All", "${Server}")`,
        (result, error) => {
          if (error) reject(error);
          resolve(result);
        }
      );
    });
