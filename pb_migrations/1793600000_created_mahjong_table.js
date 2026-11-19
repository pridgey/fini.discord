/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds mahjong tables.
 *
 * A table is one game from lobby to final scores. The whole game - wall,
 * hands, rivers, scores - is one JSON value (`game`), written after every
 * move, so a game survives a restart and a stale button can be refused by
 * its step number. Seats in the lobby and the coin side (buy-in, payouts)
 * sit beside it in their own fields.
 */

const TABLE_ID = "pbc_3400000001";

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

const number = (id, name, onlyInt = true) => ({
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

migrate(
  (app) =>
    app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: TABLE_ID,
        name: "mahjong_table",
        type: "base",
        system: false,
        indexes: [
          "CREATE INDEX `idx_mahjong_table_status` ON `mahjong_table` (`server_id`, `status`)",
        ],
        fields: [
          {
            autogeneratePattern: "[a-z0-9]{15}",
            hidden: false,
            id: "text3400000100",
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
          text("3400000101", "server_id"),
          text("3400000102", "server_name"),
          text("3400000103", "channel_id"),
          text("3400000104", "message_id"),
          text("3400000105", "host_id"),
          {
            hidden: false,
            id: "select3400000106",
            maxSelect: 1,
            name: "rules",
            presentable: false,
            required: false,
            system: false,
            type: "select",
            values: ["riichi", "hongkong"],
          },
          {
            hidden: false,
            id: "select3400000107",
            maxSelect: 1,
            name: "status",
            presentable: false,
            required: false,
            system: false,
            type: "select",
            values: ["lobby", "playing", "finished", "cancelled"],
          },
          number("3400000108", "buy_in", false),
          // Humans in the lobby: [{ id, name }].
          json("3400000109", "players"),
          // Serialised GameState once the game starts.
          json("3400000110", "game"),
          // Per-player settings and AFK strikes: { [userId]: { hints, strikes, away } }.
          json("3400000111", "prefs"),
          // When the current decision times out, in ms since the epoch.
          number("3400000112", "deadline"),
          // What each seat was paid at the end.
          json("3400000113", "payouts"),
          {
            hidden: false,
            id: "autodate3400000114",
            name: "created",
            onCreate: true,
            onUpdate: false,
            presentable: false,
            system: false,
            type: "autodate",
          },
          {
            hidden: false,
            id: "autodate3400000115",
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
  (app) => app.delete(app.findCollectionByNameOrId(TABLE_ID)),
);
