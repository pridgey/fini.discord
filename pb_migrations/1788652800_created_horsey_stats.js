/// <reference path="../pb_data/types.d.ts" />

/**
 * Per-horse win tallies for /horsey, one row per horse per server.
 *
 * Scoped by server so each guild sees its own running form guide rather than a
 * global one. There are only HORSE_COUNT rows per server, and a missing row
 * means "no wins recorded yet", so there is nothing to backfill.
 *
 * The pre-2024 version of this game kept the same tallies in a `stats` module
 * that was deleted with the old command dispatcher; those numbers are gone and
 * this starts from zero.
 */

const HORSEY_STATS_ID = "pbc_2200000002";

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

    const number = (id, name) => ({
      hidden: false,
      id: `number${id}`,
      max: null,
      min: null,
      name,
      onlyInt: true,
      presentable: false,
      required: false,
      system: false,
      type: "number",
    });

    return app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: HORSEY_STATS_ID,
        name: "horsey_stats",
        type: "base",
        system: false,
        indexes: [
          `CREATE UNIQUE INDEX \`idx_horsey_stats_horse\` ON \`horsey_stats\` (\`server_id\`, \`horse\`)`,
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
          text("2200000201", "server_id"),
          // The horse's 1-based number, not a row index.
          number("2200000202", "horse"),
          number("2200000203", "wins"),
          number("2200000204", "races"),
          text("2200000205", "identifier"),
          {
            hidden: false,
            id: "autodate2200000206",
            name: "created",
            onCreate: true,
            onUpdate: false,
            presentable: false,
            system: false,
            type: "autodate",
          },
          {
            hidden: false,
            id: "autodate2200000207",
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
  (app) => app.delete(app.findCollectionByNameOrId(HORSEY_STATS_ID)),
);
