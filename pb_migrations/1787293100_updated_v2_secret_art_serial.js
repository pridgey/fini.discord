/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Secret Art, and numbered copies.
 *
 * `v2_card_definition.secret_art` marks a card as a Secret Art: a full-art in
 * every rule that matters, with its own unique artwork, pulled on its own
 * chance per pack rather than from the full-art slot, and printed `SA`.
 *
 * `v2_user_card.serial` is the copy's number among the copies of its card on
 * its server, given when the copy is made. Cards limited to a handful of
 * copies print it: "2 OF 3".
 */

const CARD_DEFINITION_ID = "pbc_2100000001";
const USER_CARD_ID = "pbc_2100000002";

migrate(
  (app) => {
    const definitions = app.findCollectionByNameOrId(CARD_DEFINITION_ID);
    definitions.fields.add(
      new Field({
        hidden: false,
        id: "bool2100000123",
        name: "secret_art",
        presentable: false,
        required: false,
        system: false,
        type: "bool",
      }),
    );
    app.save(definitions);

    const copies = app.findCollectionByNameOrId(USER_CARD_ID);
    copies.fields.add(
      new Field({
        hidden: false,
        id: "number2100000210",
        max: null,
        min: null,
        name: "serial",
        onlyInt: true,
        presentable: false,
        required: false,
        system: false,
        type: "number",
      }),
    );
    return app.save(copies);
  },
  (app) => {
    const definitions = app.findCollectionByNameOrId(CARD_DEFINITION_ID);
    definitions.fields.removeById("bool2100000123");
    app.save(definitions);

    const copies = app.findCollectionByNameOrId(USER_CARD_ID);
    copies.fields.removeById("number2100000210");
    return app.save(copies);
  },
);
