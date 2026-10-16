/// <reference path="../pb_data/types.d.ts" />

/**
 * Lets the site ask Fini to show a card in Discord: "card_show" joins the
 * kinds of request. Fini checks the card is the player's own, posts it in the
 * server's bot channel, and allows one a minute per player.
 */
migrate(
  (app) => {
    const requests = app.findCollectionByNameOrId("web_request");
    const kind = requests.fields.getByName("kind");
    kind.values = ["deck_save", "deck_delete", "card_show"];
    app.save(requests);
  },
  (app) => {
    const requests = app.findCollectionByNameOrId("web_request");
    const kind = requests.fields.getByName("kind");
    kind.values = ["deck_save", "deck_delete"];
    app.save(requests);
  },
);
