/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Adds the two fields the card templates ask for that the schema didn't have.
 *
 * The mockups carry flavour text and an artist credit. Both are presentation
 * only - nothing in the battle engine reads them - but the design doc is
 * emphatic that retrofitting a schema across a live collection is the pain worth
 * avoiding, so they go in now while the pool is still small.
 */

const CARD_DEFINITION_ID = "pbc_2100000001";

const text = (id, name) => ({
  autogeneratePattern: "",
  hidden: false,
  id: `text${id}`,
  max: 0,
  min: 0,
  name,
  pattern: "",
  presentable: false,
  primaryKey: false,
  required: false,
  system: false,
  type: "text",
});

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(CARD_DEFINITION_ID);

    collection.fields.addAt(15, new Field(text("2100000118", "flavour")));
    collection.fields.addAt(16, new Field(text("2100000119", "artist")));

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId(CARD_DEFINITION_ID);

    collection.fields.removeById("text2100000118");
    collection.fields.removeById("text2100000119");

    return app.save(collection);
  },
);
