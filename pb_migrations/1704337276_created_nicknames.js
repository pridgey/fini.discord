/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "d8tbovsfrbp41he",
    "created": "2024-01-04 03:01:16.532Z",
    "updated": "2024-01-04 03:01:16.532Z",
    "name": "nicknames",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "ibeoblyv",
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
        "id": "r1inq35f",
        "name": "nickname",
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
  const collection = dao.findCollectionByNameOrId("d8tbovsfrbp41he");

  return dao.deleteCollection(collection);
})
