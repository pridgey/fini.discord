/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Adds per-card corrections to how artwork is cropped.
 *
 * `art_adjust` is `{ trim?, focus? }`: bars to cut off the edges of the image,
 * and where its subject is, so every crop of it - card face, hand strip,
 * dungeon doorway - centres there instead of wherever the picture is busiest.
 *
 * It is data about the image rather than a new image, so the artwork itself is
 * never rewritten and a correction can be changed or dropped at any time.
 */

const CARD_DEFINITION_ID = "pbc_2100000001";

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
    const collection = app.findCollectionByNameOrId(CARD_DEFINITION_ID);

    collection.fields.addAt(18, new Field(json("2100000121", "art_adjust")));

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId(CARD_DEFINITION_ID);

    collection.fields.removeById("json2100000121");

    return app.save(collection);
  },
);
