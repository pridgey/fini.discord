import sqlite3 from "sqlite3";
import { select, update, insert, remove } from "./dbActions";

export const db = () => {
  // connect to database
  const db = new sqlite3.Database("./fini.db");

  return {
    insert: insert(db),
    update: update(db),
    remove: remove(db),
    select: select(db),
  };
};
