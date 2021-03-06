import { Database } from "sqlite3";
import { DatabaseTables, FieldValuePair } from "../../../types";

export const remove =
  (db: Database) =>
  <T>(
    UpdatableItem: DatabaseTables,
    WhereCondition: FieldValuePair
  ): Promise<T[]> =>
    new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM ${UpdatableItem} WHERE ${
          WhereCondition.Field
        } = "${encodeURIComponent(WhereCondition.Value)}"`,
        (result, error) => {
          if (error) {
            reject(error);
          }
          resolve(result);
        }
      );
    });
