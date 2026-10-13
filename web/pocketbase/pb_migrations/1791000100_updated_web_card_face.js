/// <reference path="../pb_data/types.d.ts" />

/**
 * Gives each copy in the mailbox its card face: the same picture Discord
 * shows, rendered by Fini and sent up. A Legendary also gets its animation.
 * `face_key` is what they were rendered from, so Fini knows when a copy
 * needs them made again.
 */
migrate(
  (app) => {
    const cards = app.findCollectionByNameOrId("web_card");
    cards.fields.add(
      new Field({
        name: "face",
        type: "file",
        maxSelect: 1,
        maxSize: 5242880,
        mimeTypes: ["image/webp", "image/png", "image/gif"],
      }),
    );
    cards.fields.add(
      new Field({
        name: "animation",
        type: "file",
        maxSelect: 1,
        maxSize: 20971520,
        mimeTypes: ["image/gif"],
      }),
    );
    cards.fields.add(new Field({ name: "face_key", type: "text" }));
    app.save(cards);
  },
  (app) => {
    const cards = app.findCollectionByNameOrId("web_card");
    cards.fields.removeByName("face");
    cards.fields.removeByName("animation");
    cards.fields.removeByName("face_key");
    app.save(cards);
  },
);
