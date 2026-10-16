/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "eg50he1bd6f75ga",
    "created": "2024-09-25 20:57:31.891Z",
    "updated": "2024-09-25 20:57:31.891Z",
    "name": "poll_vote",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "jh9obpcw",
        "name": "poll_option",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "nbo10n4ztz4imv8",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "synwxybw",
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
  const collection = dao.findCollectionByNameOrId("eg50he1bd6f75ga");

  return dao.deleteCollection(collection);
})
