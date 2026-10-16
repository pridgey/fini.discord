/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Adds the release set a card belongs to (1, 2, 3...).
 *
 * v1 kept this on `card_definition.set`; v2 only had `set_piece`, which is a
 * different thing - the collection set a card completes. The card footer prints
 * it (`S3`), and it is what a release is switched on by.
 *
 * 0 means unset. Converted cards get theirs from the next pool import.
 */

const CARD_DEFINITION_ID = "pbc_2100000001";

const number = (id, name) => ({
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

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(CARD_DEFINITION_ID);

    collection.fields.addAt(17, new Field(number("2100000120", "set")));

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId(CARD_DEFINITION_ID);

    collection.fields.removeById("number2100000120");

    return app.save(collection);
  },
);
