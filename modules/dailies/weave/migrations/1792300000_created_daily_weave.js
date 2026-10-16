/// <reference path="../../../../pb_data/types.d.ts" />

/**
 * Creates the two collections behind Weave, the daily word puzzle.
 *
 * `daily_weave_round` is one puzzle per day: its 25 letters, its five words
 * and the squares each runs through, the thread word, the fogged squares, and
 * where each server's post went.
 *
 * `daily_weave_play` is one player's progress on one day's puzzle in one
 * server: the words found, the hints taken, the thread guess and the coin
 * paid. The unique index keeps it to one board each.
 *
 * A tracked copy of this file lives in `modules/dailies/weave/migrations/`
 * because `/pb_migrations` is gitignored. To apply it, copy it into
 * `pb_migrations/` and restart Pocketbase - unapplied migrations run on boot.
 */

const ROUND_ID = "pbc_2500000001";
const PLAY_ID = "pbc_2500000002";

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
        name: "daily_weave_round",
        type: "base",
        system: false,
        indexes: ["CREATE UNIQUE INDEX `idx_daily_weave_round_day` ON `daily_weave_round` (`day`)"],
        fields: [
          idField,
          text("2500000101", "day", true),
          // The 25 letters, row by row.
          text("2500000102", "grid", true),
          // [{ word, cells }], in grid order.
          json("2500000103", "words"),
          text("2500000104", "thread", true),
          json("2500000105", "fog"),
          // { [serverId]: { channelId, messageId } }
          json("2500000106", "posts"),
          ...autodates("25000001"),
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
        name: "daily_weave_play",
        type: "base",
        system: false,
        indexes: [
          "CREATE UNIQUE INDEX `idx_daily_weave_play_once` ON `daily_weave_play` (`round`, `server_id`, `user_id`)",
        ],
        fields: [
          idField,
          {
            cascadeDelete: true,
            collectionId: ROUND_ID,
            hidden: false,
            id: "relation2500000201",
            maxSelect: 1,
            minSelect: 0,
            name: "round",
            presentable: false,
            required: true,
            system: false,
            type: "relation",
          },
          text("2500000202", "server_id", true),
          text("2500000203", "user_id", true),
          text("2500000204", "username"),
          // Indexes into the round's words.
          json("2500000205", "found"),
          json("2500000206", "hinted"),
          text("2500000207", "thread_guess"),
          number("2500000208", "paid", true),
          {
            hidden: false,
            id: "bool2500000209",
            name: "finished",
            presentable: false,
            required: false,
            system: false,
            type: "bool",
          },
          ...autodates("25000002"),
        ],
      }),
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId(PLAY_ID));
    app.delete(app.findCollectionByNameOrId(ROUND_ID));
  },
);
