/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("il6j8t01dqkoe8d");

  return dao.deleteCollection(collection);
}, (db) => {
  const collection = new Collection({
    "id": "il6j8t01dqkoe8d",
    "created": "2024-09-25 20:55:45.014Z",
    "updated": "2024-09-25 21:34:35.134Z",
    "name": "poll",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "3t6worda",
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
      },
      {
        "system": false,
        "id": "hlg9txvr",
        "name": "users_can_add",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      },
      {
        "system": false,
        "id": "iarrq8sn",
        "name": "single_vote",
        "type": "bool",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      },
      {
        "system": false,
        "id": "rfmhuc7l",
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
    "indexes": [
      "CREATE UNIQUE INDEX `idx_aAt4fPa` ON `poll` (`slug`)"
    ],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
})
