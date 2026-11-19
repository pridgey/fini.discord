/// <reference path="../pb_data/types.d.ts" />

/**
 * Creates `v2_item`: dungeon items a player holds (issue #8) - collection
 * pieces that summon a Summoned card, and single-use boons. One row per item,
 * like `v2_user_card`, so each can be sold or traded on its own.
 *
 * `item` is the catalogue key (`modules/finicards/items.ts`). `source` says
 * where it came from (dungeon, trade, grant...) and `run` the dungeon run that
 * found it, for the yearly review. `active` marks a pack boon switched on for
 * the player's next pack.
 *
 * Collection pieces are one per server: there is a single 4-Star Dragon Ball,
 * held by one player at a time. `kind` is "piece" for those, and the partial
 * unique index makes a second copy impossible, so two runs racing to grant
 * the same piece can't both succeed. Boons stack freely.
 */

const ITEM_ID = "pbc_3300000001";

migrate(
  (app) => {
    const idField = {
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
    };

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

    const number = (id, name, onlyInt = false) => ({
      hidden: false,
      id: `number${id}`,
      max: null,
      min: null,
      name,
      onlyInt,
      presentable: false,
      required: false,
      system: false,
      type: "number",
    });

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

    const bool = (id, name) => ({
      hidden: false,
      id: `bool${id}`,
      name,
      presentable: false,
      required: false,
      system: false,
      type: "bool",
    });

    const autodates = (prefix) => [
      {
        hidden: false,
        id: `autodate${prefix}98`,
        name: "created",
        onCreate: true,
        onUpdate: false,
        presentable: false,
        system: false,
        type: "autodate",
      },
      {
        hidden: false,
        id: `autodate${prefix}99`,
        name: "updated",
        onCreate: true,
        onUpdate: true,
        presentable: false,
        system: false,
        type: "autodate",
      },
    ];

    return app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: ITEM_ID,
        name: "v2_item",
        type: "base",
        system: false,
        indexes: [
          "CREATE INDEX `idx_v2_item_owner` ON `v2_item` (`server_id`, `user_id`)",
          "CREATE UNIQUE INDEX `idx_v2_item_one_piece` ON `v2_item` (`server_id`, `item`) WHERE `kind` = 'piece'",
        ],
        fields: [
          idField,
          text("3300000101", "user_id", true),
          text("3300000102", "server_id", true),
          text("3300000103", "item", true),
          // "piece", "pack_boon" or "dungeon_boon", from the catalogue.
          text("3300000107", "kind", true),
          text("3300000104", "source"),
          text("3300000105", "run"),
          bool("3300000106", "active"),
          ...autodates("33000001"),
        ],
      }),
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId(ITEM_ID));
  },
);
