/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds the Summoned rarity: Shenron, Exodia and Super Sonic, each summoned by
 * completing a set of dungeon items (issue #8). One of each per server, so
 * they move to a population of 1.
 *
 * Their stats are left as they were. A Summoned card totals 18 rather than 15
 * (`RULES.statTotalByRarity`), and its spread is the card maker's call, so the
 * card manager flags them until they're respread there. They stay inactive:
 * nothing draws them, a completed set grants them directly.
 */

const SUMMONED = ["Shenron", "Exodia", "Super Sonic"];

const cardsNamed = (app, name) =>
  app.findRecordsByFilter(
    "v2_card_definition",
    "card_name = {:name}",
    "",
    0,
    0,
    { name },
  );

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("v2_card_definition");
    const rarity = collection.fields.getByName("rarity");
    rarity.values = ["common", "uncommon", "full_art", "summoned"];
    app.save(collection);

    for (const name of SUMMONED) {
      for (const record of cardsNamed(app, name)) {
        record.set("rarity", "summoned");
        record.set("population", 1);
        app.save(record);
      }
    }
  },
  (app) => {
    for (const name of SUMMONED) {
      for (const record of cardsNamed(app, name)) {
        record.set("rarity", "full_art");
        record.set("population", 0);
        app.save(record);
      }
    }

    const collection = app.findCollectionByNameOrId("v2_card_definition");
    const rarity = collection.fields.getByName("rarity");
    rarity.values = ["common", "uncommon", "full_art"];
    app.save(collection);
  },
);
