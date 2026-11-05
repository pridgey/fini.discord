/// <reference path="../pb_data/types.d.ts" />

/**
 * Records the channel a logged command ran in, so a log row can be traced
 * back to its messages in Discord. Older rows have none.
 */
migrate(
  (app) => {
    const log = app.findCollectionByNameOrId("log");
    log.fields.add(new Field({ name: "channel_id", type: "text" }));
    app.save(log);
  },
  (app) => {
    const log = app.findCollectionByNameOrId("log");
    log.fields.removeByName("channel_id");
    app.save(log);
  },
);
