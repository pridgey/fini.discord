/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds the Summoned rarity: Shenron, Exodia and Super Sonic, each summoned by
 * completing a set of dungeon items (issue #8). One of each per server, so
 * they move to a population of 1.
 *
 * A Summoned card totals 18 rather than 15 (`RULES.statTotalByRarity`), so
 * each is respread here, keeping its type and its shape: Shenron and Exodia
 * stay spikes, Super Sonic stays an all-rounder. They stay inactive: nothing
 * draws them, a completed set grants them directly.
 */

/** Each card's spread as a Summoned card, and as the full-art it was. */
const SPREADS = {
  Shenron: { now: [2, 2, 14], was: [2, 1, 12] },
  Exodia: { now: [14, 3, 1], was: [12, 2, 1] },
  "Super Sonic": { now: [6, 7, 5], was: [5, 6, 4] },
};
const SUMMONED = Object.keys(SPREADS);

const setStats = (record, [power, wit, heart]) => {
  record.set("power", power);
  record.set("wit", wit);
  record.set("heart", heart);
};

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
        setStats(record, SPREADS[name].now);
        app.save(record);
      }
    }
  },
  (app) => {
    for (const name of SUMMONED) {
      for (const record of cardsNamed(app, name)) {
        record.set("rarity", "full_art");
        record.set("population", 0);
        setStats(record, SPREADS[name].was);
        app.save(record);
      }
    }

    const collection = app.findCollectionByNameOrId("v2_card_definition");
    const rarity = collection.fields.getByName("rarity");
    rarity.values = ["common", "uncommon", "full_art"];
    app.save(collection);
  },
);
