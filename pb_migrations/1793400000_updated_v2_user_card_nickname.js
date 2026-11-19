/// <reference path="../pb_data/types.d.ts" />

/**
 * A copy's nickname, from a Name Tag (dungeon items, issue #8). It replaces
 * the card's name wherever the copy is shown. On the copy, so it travels with
 * it through a trade - a named card is the owner's to name, and the next one's
 * to keep. Empty for none.
 */
migrate(
  (app) => {
    const cards = app.findCollectionByNameOrId("v2_user_card");
    cards.fields.add(new Field({ name: "nickname", type: "text", max: 40 }));
    app.save(cards);
  },
  (app) => {
    const cards = app.findCollectionByNameOrId("v2_user_card");
    cards.fields.removeByName("nickname");
    app.save(cards);
  },
);
