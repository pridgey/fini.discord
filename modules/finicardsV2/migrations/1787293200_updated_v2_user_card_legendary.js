/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Legendaries.
 *
 * `v2_user_card.legendary` is the animated effect a copy carries ("embers",
 * "facets"...), or "" for an ordinary copy. Like a keyword it belongs to the
 * copy: any full-art can come out of a pack Legendary, in any effect.
 */

const USER_CARD_ID = "pbc_2100000002";

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(USER_CARD_ID);

    collection.fields.add(
      new Field({
        autogeneratePattern: "",
        hidden: false,
        id: "text2100000211",
        max: 0,
        min: 0,
        name: "legendary",
        pattern: "",
        presentable: false,
        primaryKey: false,
        required: false,
        system: false,
        type: "text",
      }),
    );

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId(USER_CARD_ID);

    collection.fields.removeById("text2100000211");

    return app.save(collection);
  },
);
