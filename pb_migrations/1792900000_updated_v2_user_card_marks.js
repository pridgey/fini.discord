/// <reference path="../pb_data/types.d.ts" />

/**
 * Lets a player mark a copy on the Finicards site: `favorite`, and `to_sell`
 * for a bulk sell to come. On the copy, so a mark goes when the copy is sold
 * and is cleared when it is traded. A copy is never both.
 */
migrate(
  (app) => {
    const cards = app.findCollectionByNameOrId("v2_user_card");
    cards.fields.add(new Field({ name: "favorite", type: "bool" }));
    cards.fields.add(new Field({ name: "to_sell", type: "bool" }));
    app.save(cards);
  },
  (app) => {
    const cards = app.findCollectionByNameOrId("v2_user_card");
    cards.fields.removeByName("favorite");
    cards.fields.removeByName("to_sell");
    app.save(cards);
  },
);
