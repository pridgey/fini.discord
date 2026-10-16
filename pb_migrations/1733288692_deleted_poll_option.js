/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("nbo10n4ztz4imv8");

  return dao.deleteCollection(collection);
}, (db) => {
  const collection = new Collection({
    "id": "nbo10n4ztz4imv8",
    "created": "2024-09-25 20:56:43.983Z",
    "updated": "2024-09-26 19:51:17.961Z",
    "name": "poll_option",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "w7zpga6t",
        "name": "option_name",
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
        "id": "gkoxwljl",
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
      },
      {
        "system": false,
        "id": "cdodqgzz",
        "name": "poll",
        "type": "relation",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "il6j8t01dqkoe8d",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "system": false,
        "id": "pnobkhsb",
        "name": "slug",
        "type": "number",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "noDecimal": false
        }
      }
    ],
    "indexes": [],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
})
