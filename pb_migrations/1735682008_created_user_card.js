/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "eo5o6nuz8a6ut8e",
    "created": "2024-12-31 21:53:28.925Z",
    "updated": "2024-12-31 21:53:28.925Z",
    "name": "user_card",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "h6uacr1s",
        "name": "user_id",
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
  const collection = dao.findCollectionByNameOrId("eo5o6nuz8a6ut8e");

  return dao.deleteCollection(collection);
})
