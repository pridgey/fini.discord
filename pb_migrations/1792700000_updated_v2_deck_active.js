/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds `active` to a deck: the one a battle, practice or dungeon run brings
 * when no deck is named, so a player doesn't type it every time. One per player
 * per server; setting a deck active clears the rest (`setActiveDeck`).
 */

const DECK_ID = "pbc_2100000004";

migrate(
  (app) => {
    const decks = app.findCollectionByNameOrId(DECK_ID);
    decks.fields.add(
      new Field({ id: "bool2100000410", name: "active", type: "bool" }),
    );
    return app.save(decks);
  },
  (app) => {
    const decks = app.findCollectionByNameOrId(DECK_ID);
    decks.fields.removeByName("active");
    return app.save(decks);
  },
);
