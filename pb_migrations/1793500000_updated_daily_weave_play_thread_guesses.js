/// <reference path="../pb_data/types.d.ts" />

/**
 * Lets a Weave player guess the thread more than once: every guess, in order,
 * with each wrong one halving what a right one pays. `thread_guess` stays as
 * the latest guess, so a board from before - one guess - reads the same.
 */

const PLAY_ID = "pbc_2500000002";

migrate(
  (app) => {
    const plays = app.findCollectionByNameOrId(PLAY_ID);
    plays.fields.add(
      new Field({ id: "json2500000212", name: "thread_guesses", type: "json", maxSize: 0 }),
    );
    return app.save(plays);
  },
  (app) => {
    const plays = app.findCollectionByNameOrId(PLAY_ID);
    plays.fields.removeByName("thread_guesses");
    return app.save(plays);
  },
);
