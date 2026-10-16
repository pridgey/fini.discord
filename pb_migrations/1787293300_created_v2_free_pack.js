/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Adds free packs.
 *
 * A row is one booster a player is owed and has not paid for - at launch, the
 * ones given for the v1 item cards that did not come across to v2. Opening a
 * pack marks its row opened rather than deleting it, so what was handed out
 * stays on record.
 *
 * `special` is what the pack is certain to hold beyond its five ordinary
 * rolls: "" for nothing, "secret_art", or "legendary". A free pack rolls
 * neither by chance; each server's launch batch has exactly one of each,
 * placed when the batch is made.
 */

const FREE_PACK_ID = "pbc_2100000006";

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
  (app) =>
    app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: FREE_PACK_ID,
        name: "v2_free_pack",
        type: "base",
        system: false,
        indexes: [
          `CREATE INDEX \`idx_v2_free_pack_owner\` ON \`v2_free_pack\` (\`user_id\`, \`server_id\`, \`opened\`)`,
        ],
        fields: [
          {
            autogeneratePattern: "[a-z0-9]{15}",
            hidden: false,
            id: "text3208210256",
            max: 15,
            min: 15,
            name: "id",
            pattern: "^[a-z0-9]+$",
            presentable: false,
            primaryKey: true,
            required: true,
            system: true,
            type: "text",
          },
          text("2100000601", "user_id"),
          text("2100000602", "server_id"),
          text("2100000603", "identifier"),
          text("2100000604", "special"),
          // Why it was given: "items" for the launch compensation.
          text("2100000605", "reason"),
          {
            hidden: false,
            id: "bool2100000606",
            name: "opened",
            presentable: false,
            required: false,
            system: false,
            type: "bool",
          },
          {
            hidden: false,
            id: "autodate2100000607",
            name: "created",
            onCreate: true,
            onUpdate: false,
            presentable: false,
            system: false,
            type: "autodate",
          },
          {
            hidden: false,
            id: "autodate2100000608",
            name: "updated",
            onCreate: true,
            onUpdate: true,
            presentable: false,
            system: false,
            type: "autodate",
          },
        ],
      }),
    ),
  (app) => app.delete(app.findCollectionByNameOrId(FREE_PACK_ID)),
);
