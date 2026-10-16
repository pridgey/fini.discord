/// <reference path="../pb_data/types.d.ts" />

/**
 * Drops `weather`, where /weather (removed) kept the cities it sent morning
 * reports for. Nothing else reads it.
 *
 * Reverting brings the collection back empty; the reports it held are not kept.
 */

const WEATHER_ID = "6by4rzxsju7l5yp";

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(WEATHER_ID);
    return app.delete(collection);
  },
  (app) => {
    const text = (id, name) => ({
      id,
      name,
      type: "text",
      system: false,
      required: false,
      presentable: false,
      hidden: false,
      min: 0,
      max: 0,
      pattern: "",
      autogeneratePattern: "",
      primaryKey: false,
    });

    const collection = new Collection({
      id: WEATHER_ID,
      name: "weather",
      type: "base",
      system: false,
      fields: [
        {
          id: "text3208210256",
          name: "id",
          type: "text",
          system: true,
          required: true,
          primaryKey: true,
          presentable: false,
          hidden: false,
          min: 15,
          max: 15,
          pattern: "^[a-z0-9]+$",
          autogeneratePattern: "[a-z0-9]{15}",
        },
        text("bcmyndtt", "server_id"),
        text("tbybphij", "user_id"),
        text("p926kagn", "city"),
        text("fjmp6c2t", "additional_prompt"),
        { id: "autodate2990389176", name: "created", type: "autodate", system: false, hidden: false, presentable: false, onCreate: true, onUpdate: false },
        { id: "autodate3332085495", name: "updated", type: "autodate", system: false, hidden: false, presentable: false, onCreate: true, onUpdate: true },
      ],
      indexes: [],
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
    });

    return app.save(collection);
  },
);
