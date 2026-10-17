/// <reference path="../pb_data/types.d.ts" />

/**
 * Where Finicards posts in a server - for now, the cards shown from the
 * Finicards site. Empty means the bot channel, so there is nothing to
 * backfill.
 */

const CONFIG_ID = "9lhug3taklgtin2";

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(CONFIG_ID);

    collection.fields.add(
      new Field({
        autogeneratePattern: "",
        hidden: false,
        id: "text2200000302",
        max: 0,
        min: 0,
        name: "finicards_channel",
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
    const collection = app.findCollectionByNameOrId(CONFIG_ID);
    collection.fields.removeById("text2200000302");
    return app.save(collection);
  },
);
