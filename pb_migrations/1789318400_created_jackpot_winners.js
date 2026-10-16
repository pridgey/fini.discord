/// <reference path="../pb_data/types.d.ts" />

/**
 * One row per jackpot win, so /jackpot history can show who won and how much
 * without re-deriving it from the `log` table on every call.
 *
 * `won_at` exists separately from `created` because the table was seeded from
 * historical `log` records: `created` is an autodate that PocketBase stamps at
 * insert time, so a backfilled 2024 win would otherwise claim to have happened
 * on the day the backfill ran. Everything that orders or displays history reads
 * `won_at`; `created` is only ever "when did this row get written".
 *
 * `username` is a snapshot taken at win time rather than a live lookup, so the
 * history still reads correctly after a winner leaves the server or renames.
 *
 * The unique index on (server_id, user_id, won_at) is what makes the backfill
 * script safe to re-run - a win is identified by who won it and when, so a
 * second pass over the same `log` records updates nothing and inserts nothing.
 */

const JACKPOT_WINNERS_ID = "pbc_2200000003";

migrate(
  (app) => {
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

    return app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: JACKPOT_WINNERS_ID,
        name: "jackpot_winners",
        type: "base",
        system: false,
        indexes: [
          `CREATE UNIQUE INDEX \`idx_jackpot_winners_win\` ON \`jackpot_winners\` (\`server_id\`, \`user_id\`, \`won_at\`)`,
          `CREATE INDEX \`idx_jackpot_winners_server_won_at\` ON \`jackpot_winners\` (\`server_id\`, \`won_at\`)`,
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
          text("2200000301", "server_id"),
          text("2200000302", "user_id"),
          // Winner's display name as it stood at win time, not a live lookup.
          text("2200000303", "username"),
          {
            hidden: false,
            id: "number2200000304",
            max: null,
            min: null,
            name: "amount",
            // Jackpot payouts carry cents, so this cannot be int-only.
            onlyInt: false,
            presentable: false,
            required: false,
            system: false,
            type: "number",
          },
          // When the win actually happened. See the note above on `created`.
          {
            hidden: false,
            id: "date2200000305",
            max: "",
            min: "",
            name: "won_at",
            presentable: false,
            required: false,
            system: false,
            type: "date",
          },
          // The winning message, when known. Empty for rows recovered from
          // `log`, which does not record which message triggered the win.
          text("2200000306", "message_id"),
          text("2200000307", "channel_id"),
          // How the row got here: "live" | "backfill-log" | "backfill-discord".
          text("2200000308", "source"),
          text("2200000309", "identifier"),
          {
            hidden: false,
            id: "autodate2200000310",
            name: "created",
            onCreate: true,
            onUpdate: false,
            presentable: false,
            system: false,
            type: "autodate",
          },
          {
            hidden: false,
            id: "autodate2200000311",
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
  (app) => app.delete(app.findCollectionByNameOrId(JACKPOT_WINNERS_ID)),
);
