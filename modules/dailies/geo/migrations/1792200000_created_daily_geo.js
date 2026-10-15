/// <reference path="../../../../pb_data/types.d.ts" />

/**
 * Creates the two collections behind the daily location game.
 *
 * `daily_geo_round` is one row per day: where the photos were taken, the
 * places that spot is in (so a guess can be judged without asking again), the
 * photos themselves, and where each server's post went.
 *
 * `daily_geo_guess` is one row per player per server per round. The unique
 * index is what makes "one guess a day" hold even if a player double-clicks
 * Lock in: the second insert fails.
 *
 * A tracked copy of this file lives in `modules/dailies/geo/migrations/`
 * because `/pb_migrations` is gitignored. To apply it, copy it into
 * `pb_migrations/` and restart Pocketbase - unapplied migrations run on boot.
 */

const ROUND_ID = "pbc_2400000001";
const GUESS_ID = "pbc_2400000002";

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
        name: "daily_geo_round",
        type: "base",
        system: false,
        indexes: ["CREATE UNIQUE INDEX `idx_daily_geo_round_day` ON `daily_geo_round` (`day`)"],
        fields: [
          idField,
          // The local date the round is for, "2026-10-16".
          text("2400000101", "day", true),
          number("2400000102", "answer_lat"),
          number("2400000103", "answer_lon"),
          // PlaceInfo: country, province and town codes and names.
          json("2400000104", "place"),
          {
            hidden: false,
            id: "file2400000105",
            maxSelect: 3,
            maxSize: 5242880,
            mimeTypes: ["image/jpeg"],
            name: "photos",
            presentable: false,
            protected: false,
            required: false,
            system: false,
            thumbs: [],
            type: "file",
          },
          text("2400000106", "credit"),
          text("2400000107", "license"),
          text("2400000108", "source"),
          // { [serverId]: { channelId, messageId } } for each server it was posted in.
          json("2400000109", "posts"),
          ...autodates("24000001"),
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
        id: GUESS_ID,
        name: "daily_geo_guess",
        type: "base",
        system: false,
        indexes: [
          "CREATE UNIQUE INDEX `idx_daily_geo_guess_once` ON `daily_geo_guess` (`round`, `server_id`, `user_id`)",
        ],
        fields: [
          idField,
          {
            cascadeDelete: true,
            collectionId: ROUND_ID,
            hidden: false,
            id: "relation2400000201",
            maxSelect: 1,
            minSelect: 0,
            name: "round",
            presentable: false,
            required: true,
            system: false,
            type: "relation",
          },
          text("2400000202", "server_id", true),
          text("2400000203", "user_id", true),
          text("2400000204", "username"),
          // What the player typed, and where it was understood to be.
          text("2400000205", "guess"),
          text("2400000206", "label"),
          number("2400000207", "guess_lat"),
          number("2400000208", "guess_lon"),
          number("2400000209", "km"),
          // Coin paid, after any photo multiplier.
          number("2400000210", "total", true),
          // Each check and its outcome, as the player saw them.
          json("2400000211", "checks"),
          ...autodates("24000002"),
        ],
      }),
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId(GUESS_ID));
    app.delete(app.findCollectionByNameOrId(ROUND_ID));
  },
);
