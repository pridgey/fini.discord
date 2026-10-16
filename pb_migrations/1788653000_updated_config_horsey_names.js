/// <reference path="../pb_data/types.d.ts" />

/**
 * Per-server names for the /horsey field.
 *
 * Stored on the existing `config` record rather than in its own collection:
 * this is a server-wide, admin-set preference, which is exactly what `config`
 * already is, and it means /config remains the single place a server owner
 * changes bot behaviour.
 *
 * Held as one comma-separated string rather than five columns so the field
 * count can change with HORSE_COUNT without another migration. An empty or
 * missing value means "use the built-in names", so there is nothing to
 * backfill for servers that never set them.
 */

const CONFIG_ID = "9lhug3taklgtin2";

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(CONFIG_ID);

    collection.fields.add(
      new Field({
        autogeneratePattern: "",
        hidden: false,
        id: "text2200000301",
        max: 0,
        min: 0,
        name: "horsey_names",
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
    collection.fields.removeById("text2200000301");
    return app.save(collection);
  },
);
