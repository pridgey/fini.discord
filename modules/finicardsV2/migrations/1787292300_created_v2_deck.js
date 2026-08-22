/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Adds decks, and reworks `v2_battle` around drawing a hand from one.
 *
 * Battles no longer pick three cards out of the whole collection. A player keeps
 * one or more named decks, a battle draws five cards from the deck they choose,
 * both hands are revealed, and each player then picks three of their five in
 * order. So a battle needs to remember which deck each side brought and what
 * they drew from it.
 *
 * The old `challenger_selection` / `defender_selection` fields are dropped
 * rather than repurposed - a "selection" the player made and a "hand" they were
 * dealt are different things, and leaving a misleading column name behind is how
 * the next person reads the code wrong.
 */

const BATTLE_ID = "pbc_2100000003";
const DECK_ID = "pbc_2100000004";

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

const stateField = (values) => ({
  hidden: false,
  id: "select2100000309",
  maxSelect: 1,
  name: "state",
  presentable: false,
  required: false,
  system: false,
  type: "select",
  values,
});

migrate(
  (app) => {
    /* ------------------------------------------------------- v2_deck ---- */
    app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: DECK_ID,
        name: "v2_deck",
        type: "base",
        system: false,
        indexes: [
          `CREATE INDEX \`idx_v2_deck_owner\` ON \`v2_deck\` (\`user_id\`, \`server_id\`)`,
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
          text("2100000401", "user_id"),
          text("2100000402", "server_id"),
          text("2100000403", "identifier"),
          text("2100000404", "name"),
          // Ordered list of v2_user_card ids. Decks may overlap - they double as
          // a way of organising a collection, so the same copy can sit in two.
          json("2100000405", "cards"),
          ...timestamps("2100000406", "2100000407"),
        ],
      }),
    );

    /* ----------------------------------------------------- v2_battle ---- */
    const battle = app.findCollectionByNameOrId(BATTLE_ID);

    battle.fields.removeById("json2100000314");
    battle.fields.removeById("json2100000315");

    battle.fields.addAt(12, new Field(json("2100000320", "challenger_hand")));
    battle.fields.addAt(13, new Field(json("2100000321", "defender_hand")));
    battle.fields.addAt(14, new Field(text("2100000322", "challenger_deck")));
    battle.fields.addAt(15, new Field(text("2100000323", "defender_deck")));

    battle.fields.addAt(
      9,
      new Field(
        stateField([
          "awaiting_defender",
          "awaiting_lineups",
          "resolved",
          "declined",
          "expired",
        ]),
      ),
    );

    return app.save(battle);
  },
  (app) => {
    const battle = app.findCollectionByNameOrId(BATTLE_ID);

    battle.fields.removeById("json2100000320");
    battle.fields.removeById("json2100000321");
    battle.fields.removeById("text2100000322");
    battle.fields.removeById("text2100000323");

    battle.fields.addAt(12, new Field(json("2100000314", "challenger_selection")));
    battle.fields.addAt(13, new Field(json("2100000315", "defender_selection")));
    battle.fields.addAt(
      9,
      new Field(
        stateField([
          "awaiting_defender_selection",
          "awaiting_orders",
          "resolved",
          "declined",
          "expired",
        ]),
      ),
    );

    app.save(battle);
    app.delete(app.findCollectionByNameOrId(DECK_ID));

    return null;
  },
);
