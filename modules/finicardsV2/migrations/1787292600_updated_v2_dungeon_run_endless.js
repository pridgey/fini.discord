/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Moves dungeon runs to the endless, one-room-at-a-time dungeon.
 *
 * A run no longer has a fixed row of enemies or a pile of spent cards: the
 * current room, the doors on offer, cooldowns, geld and buffs all live in the
 * `progress` json. So `played` and `enemies` go.
 *
 * Runs still in flight were started under the old rules and cannot be read by
 * the new ones, so they are closed as walked out. They pay nothing.
 */

const DUNGEON_RUN_ID = "pbc_2100000005";

const json = (id, name) => ({
  hidden: false,
  id: `json${id}`,
  maxSize: 0,
  name,
  presentable: false,
  required: false,
  system: false,
  type: "json",
});

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(DUNGEON_RUN_ID);

    collection.fields.removeById("json2100000507");
    collection.fields.removeById("json2100000508");
    app.save(collection);

    const stale = app.findRecordsByFilter(
      DUNGEON_RUN_ID,
      "state = 'active'",
      "",
      0,
      0,
    );

    for (const record of stale) {
      record.set("state", "retreated");
      record.set("reward", { kind: "none" });
      app.save(record);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId(DUNGEON_RUN_ID);
    collection.fields.addAt(7, new Field(json("2100000507", "played")));
    collection.fields.addAt(8, new Field(json("2100000508", "enemies")));
    return app.save(collection);
  },
);
