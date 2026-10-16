/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "i1h3zyqlpxh9dik",
    "created": "2025-01-01 07:57:55.369Z",
    "updated": "2025-01-01 07:57:55.369Z",
    "name": "server",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "ezydvg78",
        "name": "server_id",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "opou335c",
        "name": "servername",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("i1h3zyqlpxh9dik");

  return dao.deleteCollection(collection);
})
