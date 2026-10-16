/// <reference path="../pb_data/types.d.ts" />

/**
 * Drops `job_posts`, where the LinkedIn job scraper (removed, along with
 * Puppeteer) kept the postings it had already sent. Nothing else reads it.
 *
 * Reverting brings the collection back empty; the posts it held are not kept.
 */

const JOB_POSTS_ID = "egtan9lcmu94vzw";

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId(JOB_POSTS_ID);
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
      id: JOB_POSTS_ID,
      name: "job_posts",
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
        text("cqqo7kax", "title"),
        text("ejs49io6", "subtitle"),
        text("2j2grh4t", "caption"),
        text("girxaffa", "link"),
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
