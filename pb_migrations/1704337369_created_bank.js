/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "k8xg84q9j6ekoro",
    "created": "2024-01-04 03:02:49.048Z",
    "updated": "2024-01-04 03:02:49.048Z",
    "name": "bank",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "6gvgzymu",
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
        "id": "hk3eyobz",
        "name": "balance",
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
        "id": "mwbdmi59",
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
  const collection = dao.findCollectionByNameOrId("k8xg84q9j6ekoro");

  return dao.deleteCollection(collection);
})
