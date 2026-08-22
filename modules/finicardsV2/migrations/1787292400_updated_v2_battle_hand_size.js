/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Records how many cards a battle deals.
 *
 * The draw size is now chosen per battle so different values can be play-tested
 * against each other. It has to be stored rather than read from a constant,
 * because the defender's hand is dealt later than the challenger's and lineup
 * validation happens later still - all three have to agree on the number the
 * battle was created with, even if the default changes underneath them.
 */

const BATTLE_ID = "pbc_2100000003";

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(BATTLE_ID);

    collection.fields.addAt(
      16,
      new Field({
        hidden: false,
        id: "number2100000324",
        max: null,
        min: null,
        name: "hand_size",
        onlyInt: true,
        presentable: false,
        required: false,
        system: false,
        type: "number",
      }),
    );

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId(BATTLE_ID);
    collection.fields.removeById("number2100000324");
    return app.save(collection);
  },
);
