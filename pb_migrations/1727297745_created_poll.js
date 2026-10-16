/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "il6j8t01dqkoe8d",
    "created": "2024-09-25 20:55:45.014Z",
    "updated": "2024-09-25 20:55:45.014Z",
    "name": "poll",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "3t6worda",
        "name": "Name",
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
        "id": "novnsc6h",
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
  const collection = dao.findCollectionByNameOrId("il6j8t01dqkoe8d");

  return dao.deleteCollection(collection);
})
