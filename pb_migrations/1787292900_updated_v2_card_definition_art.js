/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Gives a v2 card its own artwork.
 *
 * Until now a card's image was either a URL in `art_url` or, for a converted
 * card, borrowed from the v1 row it came from. A card made for v2 has no v1
 * row, and a converted card whose image is replaced should not need its v1 row
 * edited - so the image can now live on the card itself, and wins when set.
 */

const CARD_DEFINITION_ID = "pbc_2100000001";

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(CARD_DEFINITION_ID);

    collection.fields.addAt(
      19,
      new Field({
        hidden: false,
        id: "file2100000122",
        maxSelect: 1,
        maxSize: 20971520,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        name: "art",
        presentable: false,
        protected: false,
        required: false,
        system: false,
        thumbs: [],
        type: "file",
      }),
    );

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId(CARD_DEFINITION_ID);

    collection.fields.removeById("file2100000122");

    return app.save(collection);
  },
);
