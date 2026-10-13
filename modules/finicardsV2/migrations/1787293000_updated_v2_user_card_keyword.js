/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Moves a card's keyword from the card to the copy.
 *
 * A keyword is rolled when a copy is made - pulled from a pack, dropped by a
 * boss - not fixed on the card's definition. Two copies of the same card can
 * carry different keywords, and that spread of card-and-keyword pairings is
 * the point of having keywords at all.
 *
 * `v2_card_definition.keyword` stays in the schema and is no longer read.
 */

const USER_CARD_ID = "pbc_2100000002";

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(USER_CARD_ID);

    collection.fields.addAt(
      7,
      new Field({
        autogeneratePattern: "",
        hidden: false,
        id: "text2100000209",
        max: 0,
        min: 0,
        name: "keyword",
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

    collection.fields.removeById("text2100000209");

    return app.save(collection);
  },
);
