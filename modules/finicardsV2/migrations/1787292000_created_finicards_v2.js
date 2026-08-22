/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Creates the three Finicards v2 collections.
 *
 * v2 shares nothing with v1 at the database level - `card_definition`,
 * `user_card` and everything the live implementation reads stay exactly as they
 * are, so both versions can run side by side and the switchover is a matter of
 * retiring commands rather than migrating data.
 *
 * A tracked copy of this file lives in `modules/finicardsV2/migrations/` because
 * `/pb_migrations` is gitignored. To apply it, copy it into `pb_migrations/` and
 * restart Pocketbase - unapplied migrations run on boot.
 */

const CARD_DEFINITION_ID = "pbc_2100000001";
const USER_CARD_ID = "pbc_2100000002";
const BATTLE_ID = "pbc_2100000003";

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

const bool = (id, name) => ({
  hidden: false,
  id: `bool${id}`,
  name,
  presentable: false,
  required: false,
  system: false,
  type: "bool",
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

const select = (id, name, values) => ({
  hidden: false,
  id: `select${id}`,
  maxSelect: 1,
  name,
  presentable: false,
  required: false,
  system: false,
  type: "select",
  values,
});

const timestamps = (createdId, updatedId) => [
  {
    hidden: false,
    id: `autodate${createdId}`,
    name: "created",
    onCreate: true,
    onUpdate: false,
    presentable: false,
    system: false,
    type: "autodate",
  },
  {
    hidden: false,
    id: `autodate${updatedId}`,
    name: "updated",
    onCreate: true,
    onUpdate: true,
    presentable: false,
    system: false,
    type: "autodate",
  },
];

const openRules = {
  listRule: "",
  viewRule: "",
  createRule: "",
  updateRule: "",
  deleteRule: "",
};

migrate(
  (app) => {
    /* ---------------------------------------------- v2_card_definition ---- */
    app.save(
      new Collection({
        ...openRules,
        id: CARD_DEFINITION_ID,
        name: "v2_card_definition",
        type: "base",
        system: false,
        indexes: [
          `CREATE INDEX \`idx_v2_card_definition_rarity\` ON \`v2_card_definition\` (\`rarity\`)`,
          `CREATE INDEX \`idx_v2_card_definition_legacy\` ON \`v2_card_definition\` (\`legacy_card\`)`,
        ],
        fields: [
          idField,
          text("2100000101", "card_name"),
          text("2100000102", "series"),
          select("2100000103", "rarity", ["common", "uncommon", "full_art"]),
          number("2100000104", "power"),
          number("2100000105", "wit"),
          number("2100000106", "heart"),
          select("2100000107", "card_type", ["power", "wit", "heart"]),
          json("2100000108", "tags"),
          text("2100000109", "keyword"),
          number("2100000110", "cost"),
          text("2100000111", "set_piece"),
          text("2100000112", "art_url"),
          text("2100000113", "legacy_card"),
          number("2100000114", "population"),
          bool("2100000115", "active"),
          ...timestamps("2100000116", "2100000117"),
        ],
      }),
    );

    /* ---------------------------------------------------- v2_user_card ---- */
    app.save(
      new Collection({
        ...openRules,
        id: USER_CARD_ID,
        name: "v2_user_card",
        type: "base",
        system: false,
        indexes: [
          `CREATE INDEX \`idx_v2_user_card_owner\` ON \`v2_user_card\` (\`user_id\`, \`server_id\`)`,
          `CREATE INDEX \`idx_v2_user_card_card\` ON \`v2_user_card\` (\`card\`)`,
        ],
        fields: [
          idField,
          text("2100000201", "user_id"),
          text("2100000202", "server_id"),
          text("2100000203", "identifier"),
          {
            cascadeDelete: false,
            collectionId: CARD_DEFINITION_ID,
            hidden: false,
            id: "relation2100000204",
            maxSelect: 1,
            minSelect: 0,
            name: "card",
            presentable: false,
            required: false,
            system: false,
            type: "relation",
          },
          bool("2100000205", "foil"),
          text("2100000206", "acquired_from"),
          ...timestamps("2100000207", "2100000208"),
        ],
      }),
    );

    /* ------------------------------------------------------- v2_battle ---- */
    app.save(
      new Collection({
        ...openRules,
        id: BATTLE_ID,
        name: "v2_battle",
        type: "base",
        system: false,
        indexes: [
          `CREATE INDEX \`idx_v2_battle_defender\` ON \`v2_battle\` (\`defender_id\`, \`server_id\`, \`state\`)`,
          `CREATE INDEX \`idx_v2_battle_challenger\` ON \`v2_battle\` (\`challenger_id\`, \`server_id\`, \`state\`)`,
        ],
        fields: [
          idField,
          text("2100000301", "server_id"),
          text("2100000302", "channel_id"),
          text("2100000303", "challenger_id"),
          text("2100000304", "challenger_name"),
          text("2100000305", "defender_id"),
          text("2100000306", "defender_name"),
          json("2100000307", "challenger_lineup"),
          json("2100000308", "defender_lineup"),
          select("2100000309", "state", [
            "awaiting_defender",
            "resolved",
            "declined",
            "expired",
          ]),
          json("2100000310", "result"),
          number("2100000311", "wager"),
          ...timestamps("2100000312", "2100000313"),
        ],
      }),
    );

    return null;
  },
  (app) => {
    // Down: drop the battle table first so the relation has nothing pointing at it.
    for (const name of ["v2_battle", "v2_user_card", "v2_card_definition"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (err) {
        // Already gone - nothing to undo.
      }
    }
    return null;
  },
);
