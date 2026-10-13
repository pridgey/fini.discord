/// <reference path="../pb_data/types.d.ts" />

/**
 * The schema of the web mailbox: the public Pocketbase the Finicards site
 * talks to. It is not Fini's database and never reaches it.
 *
 * Fini signs in here as a superuser and keeps the `web_*` snapshot
 * collections in step with its own database. Players sign in with Discord,
 * can read only what is theirs, and can write one thing: a `web_request`,
 * which Fini picks up, checks against the real data, and applies or refuses.
 *
 * Snapshot rows carry their owner as a Discord user id. A signed-in user is
 * matched to one through `_externalAuths`, where Pocketbase itself records the
 * Discord id at sign-in - so nothing a browser sends decides who it is.
 */

/** True when the row's `owner` is the signed-in user's Discord id. */
const mine = (ownerField) =>
  [
    '@request.auth.id != ""',
    "@collection._externalAuths.recordRef ?= @request.auth.id",
    '@collection._externalAuths.provider ?= "discord"',
    `@collection._externalAuths.providerId ?= ${ownerField}`,
  ].join(" && ");

const SIGNED_IN = '@request.auth.id != ""';

const text = (name, extra = {}) => ({ name, type: "text", ...extra });
const number = (name, extra = {}) => ({ name, type: "number", ...extra });
const bool = (name) => ({ name, type: "bool" });
const json = (name, maxSize = 0) => ({ name, type: "json", maxSize });
const timestamps = () => [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];

/** Only Fini - a superuser - writes; `list` decides who reads. */
const snapshot = (name, list, fields, indexes = []) =>
  new Collection({
    type: "base",
    name,
    listRule: list,
    viewRule: list,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [...fields, ...timestamps()],
    indexes,
  });

migrate(
  (app) => {
    /* ---------------------------------------------------------------- users */
    const users = app.findCollectionByNameOrId("users");
    users.listRule = "id = @request.auth.id";
    users.viewRule = "id = @request.auth.id";
    // Sign-up through Discord needs a create rule that is not locked. An
    // account made any other way has no way to sign in, so it reaches nothing.
    users.createRule = "";
    users.updateRule = null;
    users.deleteRule = "id = @request.auth.id";
    // The site asks Discord for a name and nothing else, so no email arrives.
    users.fields.getByName("email").required = false;
    users.passwordAuth.enabled = false;
    users.otp.enabled = false;
    users.mfa.enabled = false;
    // The Discord client id and secret are added in the dashboard, not here.
    users.oauth2.enabled = true;
    users.oauth2.mappedFields.name = "name";
    users.oauth2.mappedFields.avatarURL = "avatar";
    app.save(users);

    /* ------------------------------------------------------------- web_meta */
    // One row of what the site needs to know about the game: deck limits,
    // keyword and Legendary text. Sent by Fini so the two can never disagree.
    app.save(snapshot("web_meta", SIGNED_IN, [json("data")]));

    /* ------------------------------------------------------- web_definition */
    // A card as printed. A Secret Art is shown only to a player who holds one.
    const definitions = snapshot(
      "web_definition",
      "",
      [
        text("card_name"),
        text("series"),
        text("rarity"),
        text("card_type"),
        number("power"),
        number("wit"),
        number("heart"),
        number("cost"),
        json("tags"),
        number("set"),
        number("number"),
        number("set_size"),
        number("population"),
        bool("secret_art"),
        text("flavour"),
        text("artist"),
        // Where the subject sits in the artwork, as fractions, for cropping.
        number("focus_x"),
        number("focus_y"),
        // What the artwork was made from, so Fini knows when to send it again.
        text("art_key"),
        {
          name: "art",
          type: "file",
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ["image/webp", "image/png", "image/jpeg"],
        },
      ],
    );
    app.save(definitions);

    /* ------------------------------------------------------------- web_card */
    // One owned copy. Its id is the copy's id in Fini's database.
    const cards = snapshot(
      "web_card",
      mine("owner"),
      [
        text("owner", { required: true }),
        text("server_id", { required: true }),
        {
          name: "definition",
          type: "relation",
          collectionId: definitions.id,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        bool("foil"),
        text("keyword"),
        text("legendary"),
        number("serial"),
        text("acquired_from"),
        text("acquired"),
      ],
      ["CREATE INDEX idx_web_card_owner ON web_card (owner, server_id)"],
    );
    app.save(cards);

    // Now that copies exist to check against, hide Secret Arts from everyone
    // who does not hold one.
    const secretRule = [
      SIGNED_IN,
      "&& (secret_art = false || (",
      "@collection.web_card.definition ?= id",
      "&& @collection._externalAuths.recordRef ?= @request.auth.id",
      '&& @collection._externalAuths.provider ?= "discord"',
      "&& @collection._externalAuths.providerId ?= @collection.web_card.owner",
      "))",
    ].join(" ");
    definitions.listRule = secretRule;
    definitions.viewRule = secretRule;
    app.save(definitions);

    /* ------------------------------------------------------------- web_deck */
    app.save(
      snapshot(
        "web_deck",
        mine("owner"),
        [
          text("owner", { required: true }),
          text("server_id", { required: true }),
          text("name"),
          json("cards"),
        ],
        ["CREATE INDEX idx_web_deck_owner ON web_deck (owner, server_id)"],
      ),
    );

    /* ----------------------------------------------------------- web_player */
    // One row per player per server: which servers the site offers them.
    app.save(
      snapshot(
        "web_player",
        mine("owner"),
        [
          text("owner", { required: true }),
          text("server_id", { required: true }),
          text("server_name"),
          text("identifier"),
          number("cards"),
        ],
        ["CREATE UNIQUE INDEX idx_web_player ON web_player (owner, server_id)"],
      ),
    );

    /* ---------------------------------------------------------- web_request */
    // The mailbox itself. A player may only ask, and only as themselves; the
    // answer is written by Fini.
    app.save(
      new Collection({
        type: "base",
        name: "web_request",
        listRule: "user = @request.auth.id",
        viewRule: "user = @request.auth.id",
        createRule:
          '@request.auth.id != "" && user = @request.auth.id && status = "pending" && message = "" && deck = ""',
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: "user",
            type: "relation",
            collectionId: users.id,
            maxSelect: 1,
            required: true,
            cascadeDelete: true,
          },
          text("server_id", { required: true, max: 32 }),
          {
            name: "kind",
            type: "select",
            maxSelect: 1,
            required: true,
            values: ["deck_save", "deck_delete"],
          },
          json("payload", 20000),
          {
            name: "status",
            type: "select",
            maxSelect: 1,
            required: true,
            values: ["pending", "applied", "rejected"],
          },
          // Fini's answer: why it was refused, or what was done.
          text("message"),
          // The deck the request made or changed.
          text("deck"),
          ...timestamps(),
        ],
        indexes: ["CREATE INDEX idx_web_request_status ON web_request (status, created)"],
      }),
    );
  },
  (app) => {
    for (const name of [
      "web_request",
      "web_player",
      "web_deck",
      "web_card",
      "web_definition",
      "web_meta",
    ]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  },
);
