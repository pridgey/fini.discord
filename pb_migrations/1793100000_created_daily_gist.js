/// <reference path="../pb_data/types.d.ts" />

/**
 * Creates the two collections behind Gist, the daily phrase game.
 *
 * `daily_gist_round` is one phrase per day: its category and text, the letter
 * prices that day was played at (so changing prices later doesn't rewrite
 * history), its difficulty score when it was picked, and where each server's
 * post went.
 *
 * `daily_gist_play` is one player's go at one day's phrase in one server:
 * every move in order - each letter with its price, hits and the pot after;
 * each solve with what was typed and whether it was right, wrong or didn't fit
 * the board - plus the pot and the coin paid. The moves are the log for tuning
 * prices. The unique index keeps it to one go each.
 */

const ROUND_ID = "pbc_3100000001";
const PLAY_ID = "pbc_3100000002";

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

    app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: ROUND_ID,
        name: "daily_gist_round",
        type: "base",
        system: false,
        indexes: [
          "CREATE UNIQUE INDEX `idx_daily_gist_round_day` ON `daily_gist_round` (`day`)",
        ],
        fields: [
          idField,
          text("3100000101", "day", true),
          text("3100000102", "category", true),
          text("3100000103", "text", true),
          // { [letter]: fc }
          json("3100000104", "prices"),
          // What a most-common-letters-first player would keep; see game.ts.
          number("3100000105", "difficulty"),
          // { [serverId]: { channelId, messageId, combined? } }
          json("3100000106", "posts"),
          ...autodates("31000001"),
        ],
      }),
    );

    return app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: PLAY_ID,
        name: "daily_gist_play",
        type: "base",
        system: false,
        indexes: [
          "CREATE UNIQUE INDEX `idx_daily_gist_play_once` ON `daily_gist_play` (`round`, `server_id`, `user_id`)",
        ],
        fields: [
          idField,
          {
            cascadeDelete: true,
            collectionId: ROUND_ID,
            hidden: false,
            id: "relation3100000201",
            maxSelect: 1,
            minSelect: 0,
            name: "round",
            presentable: false,
            required: true,
            system: false,
            type: "relation",
          },
          text("3100000202", "server_id", true),
          text("3100000203", "user_id", true),
          text("3100000204", "username"),
          // [{ kind: "letter", letter, price, hits, pot }
          //  | { kind: "solve", guess, result, cost, pot }
          //  | { kind: "give-up", pot }]
          json("3100000205", "moves"),
          number("3100000206", "pot"),
          number("3100000207", "paid", true),
          bool("3100000208", "solved"),
          bool("3100000209", "finished"),
          ...autodates("31000002"),
        ],
      }),
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId(PLAY_ID));
    app.delete(app.findCollectionByNameOrId(ROUND_ID));
  },
);
