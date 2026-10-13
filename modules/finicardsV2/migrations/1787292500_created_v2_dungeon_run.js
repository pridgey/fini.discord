/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Adds dungeon runs.
 *
 * A run is one player's trip through a row of rooms: the hand they were dealt,
 * the enemies they were shown, the cards they have spent and how each room
 * resolved. It is its own collection rather than more columns on `v2_battle` -
 * a battle has two players and resolves in one step, a run has one player and
 * resolves a room at a time, and the two share no state machine.
 */

const DUNGEON_RUN_ID = "pbc_2100000005";

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

migrate(
  (app) =>
    app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: DUNGEON_RUN_ID,
        name: "v2_dungeon_run",
        type: "base",
        system: false,
        indexes: [
          `CREATE INDEX \`idx_v2_dungeon_run_owner\` ON \`v2_dungeon_run\` (\`user_id\`, \`server_id\`, \`state\`)`,
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
          text("2100000501", "user_id"),
          text("2100000502", "server_id"),
          text("2100000503", "channel_id"),
          text("2100000504", "player_name"),
          text("2100000505", "deck"),
          // v2_user_card ids: the hand dealt, and the ones already spent.
          json("2100000506", "hand"),
          json("2100000507", "played"),
          // Serialised BattleCards, snapshotted when the run starts.
          json("2100000508", "enemies"),
          // Serialised DungeonProgress: resolved rooms plus keyword state.
          json("2100000509", "progress"),
          {
            hidden: false,
            id: "select2100000510",
            maxSelect: 1,
            name: "state",
            presentable: false,
            required: false,
            system: false,
            type: "select",
            values: ["active", "cleared", "failed", "retreated"],
          },
          number("2100000511", "entry_fee"),
          json("2100000512", "reward"),
          ...timestamps("2100000513", "2100000514"),
        ],
      }),
    ),
  (app) => app.delete(app.findCollectionByNameOrId(DUNGEON_RUN_ID)),
);
