/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "f0h41l6nkti4ark",
    "created": "2025-01-07 03:36:58.477Z",
    "updated": "2025-01-07 03:36:58.477Z",
    "name": "card_suggestion",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "61ua0yz3",
        "name": "name",
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
        "id": "zb48cghy",
        "name": "description",
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
  const collection = dao.findCollectionByNameOrId("f0h41l6nkti4ark");

  return dao.deleteCollection(collection);
})
