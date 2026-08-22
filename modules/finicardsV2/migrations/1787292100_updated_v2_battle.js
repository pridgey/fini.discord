/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Reworks `v2_battle` for the Stadium match structure.
 *
 * The flow is now: both players commit a *set* of three cards blind, both sets
 * are revealed, then both secretly commit an *order*. So a battle needs to store
 * the unordered selection separately from the ordered lineup, and the state
 * machine grows a second waiting state.
 *
 * `challenger_lineup` / `defender_lineup` keep their meaning - the final ordered
 * lineup - so nothing already written becomes wrong.
 */

const BATTLE_ID = "pbc_2100000003";

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(BATTLE_ID);

    // The unordered three cards each side brings, revealed once both are in.
    collection.fields.addAt(
      12,
      new Field({
        hidden: false,
        id: "json2100000314",
        maxSize: 0,
        name: "challenger_selection",
        presentable: false,
        required: false,
        system: false,
        type: "json",
      }),
    );

    collection.fields.addAt(
      13,
      new Field({
        hidden: false,
        id: "json2100000315",
        maxSize: 0,
        name: "defender_selection",
        presentable: false,
        required: false,
        system: false,
        type: "json",
      }),
    );

    // Two waiting states instead of one.
    collection.fields.addAt(
      9,
      new Field({
        hidden: false,
        id: "select2100000309",
        maxSelect: 1,
        name: "state",
        presentable: false,
        required: false,
        system: false,
        type: "select",
        values: [
          "awaiting_defender_selection",
          "awaiting_orders",
          "resolved",
          "declined",
          "expired",
        ],
      }),
    );

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId(BATTLE_ID);

    collection.fields.removeById("json2100000314");
    collection.fields.removeById("json2100000315");

    collection.fields.addAt(
      9,
      new Field({
        hidden: false,
        id: "select2100000309",
        maxSelect: 1,
        name: "state",
        presentable: false,
        required: false,
        system: false,
        type: "select",
        values: ["awaiting_defender", "resolved", "declined", "expired"],
      }),
    );

    return app.save(collection);
  },
);
