/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Creates the two collections behind saved `/tts` voices.
 *
 * `tts_voices` is the catalogue, and is global: a voice saved in one server is
 * usable in every server Fini is in. The clip stored is the normalised 24kHz
 * mono wav rather than whatever was uploaded, so it is already in the form the
 * model reads and its hash is stable enough to catch the same clip saved twice.
 *
 * `tts_voice_usage` is per server, and is what decides which 25 voices a server
 * sees in the picker before anyone types.
 *
 * Names are unique case-insensitively, and so are clip hashes. The bot checks
 * both before it writes, so the indexes are a backstop for two saves racing
 * rather than the primary check.
 *
 * A tracked copy of this file lives in `modules/tts/migrations/` because
 * `/pb_migrations` is gitignored. To apply it, copy it into `pb_migrations/` and
 * restart Pocketbase - unapplied migrations run on boot.
 */

const TTS_VOICES_ID = "pbc_2300000001";
const TTS_VOICE_USAGE_ID = "pbc_2300000002";

migrate(
  (app) => {
    const idField = {
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
    };

    const text = (id, name, required = false) => ({
      autogeneratePattern: "",
      hidden: false,
      id: `text${id}`,
      max: 0,
      min: 0,
      name,
      pattern: "",
      presentable: false,
      primaryKey: false,
      required,
      system: false,
      type: "text",
    });

    const number = (id, name) => ({
      hidden: false,
      id: `number${id}`,
      max: null,
      min: null,
      name,
      onlyInt: true,
      presentable: false,
      required: false,
      system: false,
      type: "number",
    });

    const autodates = (prefix) => [
      {
        hidden: false,
        id: `autodate${prefix}98`,
        name: "created",
        onCreate: true,
        onUpdate: false,
        presentable: false,
        system: false,
        type: "autodate",
      },
      {
        hidden: false,
        id: `autodate${prefix}99`,
        name: "updated",
        onCreate: true,
        onUpdate: true,
        presentable: false,
        system: false,
        type: "autodate",
      },
    ];

    app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: TTS_VOICES_ID,
        name: "tts_voices",
        type: "base",
        system: false,
        indexes: [
          "CREATE UNIQUE INDEX `idx_tts_voices_name` ON `tts_voices` (`name` COLLATE NOCASE)",
          "CREATE UNIQUE INDEX `idx_tts_voices_clip_hash` ON `tts_voices` (`clip_hash`)",
        ],
        fields: [
          idField,
          text("2300000101", "name", true),
          {
            hidden: false,
            id: "file2300000102",
            maxSelect: 1,
            // 30 seconds of 24kHz 16-bit mono is about 1.4MB.
            maxSize: 5242880,
            mimeTypes: [],
            name: "clip",
            presentable: false,
            protected: false,
            required: true,
            system: false,
            thumbs: [],
            type: "file",
          },
          text("2300000103", "transcript"),
          text("2300000104", "clip_hash", true),
          text("2300000105", "user_id"),
          text("2300000106", "server_id"),
          ...autodates("23000001"),
        ],
      }),
    );

    return app.save(
      new Collection({
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
        id: TTS_VOICE_USAGE_ID,
        name: "tts_voice_usage",
        type: "base",
        system: false,
        indexes: [
          "CREATE UNIQUE INDEX `idx_tts_voice_usage_voice` ON `tts_voice_usage` (`server_id`, `voice`)",
        ],
        fields: [
          idField,
          text("2300000201", "server_id"),
          // A saved voice's record id, or `preset:<name>` for a shipped one.
          text("2300000202", "voice"),
          number("2300000203", "uses"),
          text("2300000204", "last_used"),
          ...autodates("23000002"),
        ],
      }),
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId(TTS_VOICE_USAGE_ID));
    app.delete(app.findCollectionByNameOrId(TTS_VOICES_ID));
  },
);
