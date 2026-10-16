/// <reference path="../../../../pb_data/types.d.ts" />

/**
 * Adds two fields to a Weave board: how many words were guessed, for the
 * "solved in N guesses" message, and what the thread paid - which depends on
 * how many of its letters were showing when it was guessed, so it's fixed
 * then rather than worked out later.
 *
 * A tracked copy of this file lives in `modules/dailies/weave/migrations/`
 * because `/pb_migrations` is gitignored. To apply it, copy it into
 * `pb_migrations/` and restart Pocketbase - unapplied migrations run on boot.
 */

const PLAY_ID = "pbc_2500000002";

migrate(
  (app) => {
    const plays = app.findCollectionByNameOrId(PLAY_ID);
    plays.fields.add(
      new Field({ id: "number2500000210", name: "guesses", type: "number", onlyInt: true, min: 0 }),
    );
    plays.fields.add(
      new Field({ id: "number2500000211", name: "thread_fc", type: "number", onlyInt: true, min: 0 }),
    );
    return app.save(plays);
  },
  (app) => {
    const plays = app.findCollectionByNameOrId(PLAY_ID);
    plays.fields.removeByName("guesses");
    plays.fields.removeByName("thread_fc");
    return app.save(plays);
  },
);
