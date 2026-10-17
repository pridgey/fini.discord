/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Set numbers.
 *
 * `v2_card_definition.number` is a card's place in its release set and
 * `set_size` how many cards that set counts, printed together in the footer as
 * "12/217". A Secret Art is not counted, so its number runs past the size:
 * "218/217". Both are written by `scripts/finicards/number-sets.ts`.
 */

const CARD_DEFINITION_ID = "pbc_2100000001";

const numberField = (id, name) =>
  new Field({
    hidden: false,
    id,
    max: null,
    min: null,
    name,
    onlyInt: true,
    presentable: false,
    required: false,
    system: false,
    type: "number",
  });

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(CARD_DEFINITION_ID);

    collection.fields.add(numberField("number2100000124", "number"));
    collection.fields.add(numberField("number2100000125", "set_size"));

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId(CARD_DEFINITION_ID);

    collection.fields.removeById("number2100000124");
    collection.fields.removeById("number2100000125");

    return app.save(collection);
  },
);
