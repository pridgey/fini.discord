/// <reference path="../../../pb_data/types.d.ts" />

/**
 * A finished dungeon run's numbers, as columns.
 *
 * Everything about a run already lives in its `progress` and `reward` json,
 * but that is the game's working state: large, and free to change shape. These
 * columns are the record kept for looking back on - a year of runs, say -
 * written once when the run is settled (`dungeonStats.ts`).
 */

const DUNGEON_RUN_ID = "pbc_2100000005";

const number = (id, name) =>
  new Field({
    hidden: false,
    id: `number${id}`,
    max: null,
    min: null,
    name,
    onlyInt: true,
    presentable: false,
    required: false,
    system: false,
    type: "number",
  });

const NUMBERS = [
  ["2100000520", "depth"],
  ["2100000521", "fights_won"],
  ["2100000522", "bosses_won"],
  ["2100000523", "geld_earned"],
  ["2100000524", "coin_paid"],
  ["2100000525", "cards_won"],
];

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(DUNGEON_RUN_ID);

    for (const [id, name] of NUMBERS) collection.fields.add(number(id, name));
    collection.fields.add(
      new Field({
        hidden: false,
        id: "date2100000526",
        max: "",
        min: "",
        name: "ended",
        presentable: false,
        required: false,
        system: false,
        type: "date",
      }),
    );

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId(DUNGEON_RUN_ID);

    for (const [id] of NUMBERS) collection.fields.removeById(`number${id}`);
    collection.fields.removeById("date2100000526");

    return app.save(collection);
  },
);
