/// <reference path="../pb_data/types.d.ts" />

/**
 * Creates `v2_pack_open`: one row per pack opened that could have been a god
 * pack, and whether it was. A server's latest god pack and the packs opened
 * since set its god pack odds - a week's cooldown, then a ramp. Its own
 * collection, append-only, because cards are deleted when sold and so can't
 * hold that history.
 */

const ID = "pbc_2800000001";

migrate(
  (app) => {
    const text = (id, name, required = false) => ({
      autogeneratePattern: "",
      hidden: false,
      id: `text${id}`,
      max: 0,
      min: 0,
      name,
      pattern: "",
      presentable: false,
      primaryKey: false,
      required,
      system: false,
      type: "text",
    });

    return app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: ID,
        name: "v2_pack_open",
        type: "base",
        system: false,
        indexes: [
          "CREATE INDEX `idx_v2_pack_open_server` ON `v2_pack_open` (`server_id`, `created`)",
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
          text("2800000101", "server_id", true),
          text("2800000102", "user_id", true),
          {
            hidden: false,
            id: "bool2800000103",
            name: "god_pack",
            presentable: false,
            required: false,
            system: false,
            type: "bool",
          },
          {
            hidden: false,
            id: "autodate2800000198",
            name: "created",
            onCreate: true,
            onUpdate: false,
            presentable: false,
            system: false,
            type: "autodate",
          },
          {
            hidden: false,
            id: "autodate2800000199",
            name: "updated",
            onCreate: true,
            onUpdate: true,
            presentable: false,
            system: false,
            type: "autodate",
          },
        ],
      }),
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId(ID));
  },
);
