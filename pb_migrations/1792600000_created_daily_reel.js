/// <reference path="../pb_data/types.d.ts" />

/**
 * Creates the two collections behind Reel, the daily guess-the-film game.
 *
 * `daily_reel_round` is one film per day: its TMDB id, title and year, the five
 * frames shown in order (TMDB image paths), and where each server's post went.
 *
 * `daily_reel_play` is one player's go at one day's film in one server: each
 * guess or skip in order, and the coin paid. The unique index keeps it to one
 * go each.
 */

const ROUND_ID = "pbc_2600000001";
const PLAY_ID = "pbc_2600000002";

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
        name: "daily_reel_round",
        type: "base",
        system: false,
        indexes: [
          "CREATE UNIQUE INDEX `idx_daily_reel_round_day` ON `daily_reel_round` (`day`)",
        ],
        fields: [
          idField,
          text("2600000101", "day", true),
          number("2600000102", "movie_id", true),
          text("2600000103", "title", true),
          text("2600000104", "year"),
          // TMDB image paths, in the order they're shown.
          json("2600000105", "frames"),
          // { [serverId]: { channelId, messageId, combined? } }
          json("2600000106", "posts"),
          ...autodates("26000001"),
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
        name: "daily_reel_play",
        type: "base",
        system: false,
        indexes: [
          "CREATE UNIQUE INDEX `idx_daily_reel_play_once` ON `daily_reel_play` (`round`, `server_id`, `user_id`)",
        ],
        fields: [
          idField,
          {
            cascadeDelete: true,
            collectionId: ROUND_ID,
            hidden: false,
            id: "relation2600000201",
            maxSelect: 1,
            minSelect: 0,
            name: "round",
            presentable: false,
            required: true,
            system: false,
            type: "relation",
          },
          text("2600000202", "server_id", true),
          text("2600000203", "user_id", true),
          text("2600000204", "username"),
          // [{ kind: "guess", movieId, title, year } | { kind: "skip" }]
          json("2600000205", "guesses"),
          number("2600000206", "paid", true),
          bool("2600000207", "solved"),
          bool("2600000208", "finished"),
          ...autodates("26000002"),
        ],
      }),
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId(PLAY_ID));
    app.delete(app.findCollectionByNameOrId(ROUND_ID));
  },
);
