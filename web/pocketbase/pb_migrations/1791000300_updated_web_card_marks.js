/// <reference path="../pb_data/types.d.ts" />

/**
 * A copy's marks, as Fini holds them: `favorite` and `to_sell`. The site asks
 * for a change with a "card_mark" request; Fini checks the copy is the
 * player's own, makes the change, and sends the copy back up.
 */
migrate(
  (app) => {
    const cards = app.findCollectionByNameOrId("web_card");
    cards.fields.add(new Field({ name: "favorite", type: "bool" }));
    cards.fields.add(new Field({ name: "to_sell", type: "bool" }));
    app.save(cards);

    const requests = app.findCollectionByNameOrId("web_request");
    requests.fields.getByName("kind").values = [
      "deck_save",
      "deck_delete",
      "card_show",
      "card_mark",
    ];
    app.save(requests);
  },
  (app) => {
    const cards = app.findCollectionByNameOrId("web_card");
    cards.fields.removeByName("favorite");
    cards.fields.removeByName("to_sell");
    app.save(cards);

    const requests = app.findCollectionByNameOrId("web_request");
    requests.fields.getByName("kind").values = [
      "deck_save",
      "deck_delete",
      "card_show",
    ];
    app.save(requests);
  },
);
