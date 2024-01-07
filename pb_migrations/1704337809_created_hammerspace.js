/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "y3yb78k8bezx5pg",
    "created": "2024-01-04 03:10:09.783Z",
    "updated": "2024-01-04 03:10:09.783Z",
    "name": "hammerspace",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "z1fivmjx",
        "name": "item",
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
        "id": "7cybiz7m",
        "name": "times_used",
        "type": "number",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "noDecimal": false
        }
      },
      {
        "system": false,
        "id": "ippmkmxg",
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
        "id": "ahrpqsq0",
        "name": "created_by_user_id",
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
  const collection = dao.findCollectionByNameOrId("y3yb78k8bezx5pg");

  return dao.deleteCollection(collection);
})
