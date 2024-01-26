/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "v13cb0fflbeetij",
    "created": "2024-01-25 21:52:47.128Z",
    "updated": "2024-01-25 21:52:47.128Z",
    "name": "tts",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "04iaunja",
        "name": "channel_id",
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
        "id": "gvucvg66",
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
  const collection = dao.findCollectionByNameOrId("v13cb0fflbeetij");

  return dao.deleteCollection(collection);
})
