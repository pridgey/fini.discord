/// <reference path="../pb_data/types.d.ts" />

/**
 * Per-user AI chat preferences.
 *
 * Kept separate from the `config` collection: that one is a server-wide,
 * admin-only record (one row per guild), while this is set by each user for
 * themselves. Scoped by user *and* server to match how every other user-level
 * setting works here (chat history, personalities) - the same person can want
 * a different model in a different server.
 *
 * A missing row means "unset", which the code reads as the default model,
 * so there is nothing to backfill.
 */

const CHAT_CONFIG_ID = "pbc_2200000001";

migrate(
  (app) => {
    const text = (id, name) => ({
      autogeneratePattern: "",
      hidden: false,
      id: `text${id}`,
      max: 0,
      min: 0,
      name,
      pattern: "",
      presentable: false,
      primaryKey: false,
      required: false,
      system: false,
      type: "text",
    });

    return app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: CHAT_CONFIG_ID,
        name: "chat_config",
        type: "base",
        system: false,
        indexes: [
          `CREATE UNIQUE INDEX \`idx_chat_config_owner\` ON \`chat_config\` (\`user_id\`, \`server_id\`)`,
        ],
        fields: [
          {
            autogeneratePattern: "[a-z0-9]{15}",
            hidden: false,
            id: "text3208210256",
            max: 15,
            min: 15,
            name: "id",
            pattern: "^[a-z0-9]+$",
            presentable: false,
            primaryKey: true,
            required: true,
            system: true,
            type: "text",
          },
          text("2200000101", "user_id"),
          text("2200000102", "server_id"),
          // "llama-gemma" | "claude". Stored as free text rather than a select
          // so adding a model later is a code change, not a schema migration.
          text("2200000103", "model"),
          text("2200000104", "identifier"),
          {
            hidden: false,
            id: "autodate2200000105",
            name: "created",
            onCreate: true,
            onUpdate: false,
            presentable: false,
            system: false,
            type: "autodate",
          },
          {
            hidden: false,
            id: "autodate2200000106",
            name: "updated",
            onCreate: true,
            onUpdate: true,
            presentable: false,
            system: false,
            type: "autodate",
          },
        ],
      }),
    );
  },
  (app) => app.delete(app.findCollectionByNameOrId(CHAT_CONFIG_ID)),
);
