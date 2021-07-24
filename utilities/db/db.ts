import sqlite3 from "sqlite3";
import { select } from "./dbActions";

export const db = () => {
  // connect to database
  const db = new sqlite3.Database("./fini.db");

  return {
    add: () => undefined,
    update: () => undefined,
    delete: () => undefined,
    select: select(db),
  };
};
