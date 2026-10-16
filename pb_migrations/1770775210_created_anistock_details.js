/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text3208210256",
        "max": 0,
        "min": 0,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "_clone_MzIV",
        "max": 0,
        "min": 0,
        "name": "title",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "_clone_TBUJ",
        "max": 0,
        "min": 0,
        "name": "image_url",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "_clone_32ob",
        "max": null,
        "min": null,
        "name": "mal_id",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "_clone_HUH6",
        "maxSelect": 1,
        "name": "season",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "spring",
          "summer",
          "fall",
          "winter"
        ]
      },
      {
        "hidden": false,
        "id": "_clone_GLbS",
        "max": null,
        "min": null,
        "name": "year",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "_clone_AHWv",
        "maxSelect": 1,
        "name": "status",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "upcoming",
          "finished",
          "ongoing"
        ]
      },
      {
        "hidden": false,
        "id": "_clone_JcUh",
        "max": null,
        "min": null,
        "name": "latest_price",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "_clone_snDg",
        "max": null,
        "min": null,
        "name": "latest_popularity",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "_clone_scjk",
        "max": null,
        "min": null,
        "name": "latest_members",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "_clone_Chat",
        "max": null,
        "min": null,
        "name": "latest_favorites",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "_clone_EAeN",
        "max": null,
        "min": null,
        "name": "latest_rank",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "_clone_ACs9",
        "max": null,
        "min": null,
        "name": "latest_score",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "_clone_7srm",
        "name": "price_updated_at",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_3371642188",
    "indexes": [],
    "listRule": "",
    "name": "anistock_details",
    "system": false,
    "type": "view",
    "updateRule": null,
    "viewQuery": "SELECT \n  a.id,\n  a.title,\n  a.image_url,\n  a.mal_id,\n  a.season,\n  a.year,\n  a.status,\n  s.stock_price as latest_price,\n  s.popularity as latest_popularity,\n  s.members as latest_members,\n  s.favorites as latest_favorites,\n  s.rank as latest_rank,\n  s.score as latest_score,\n  s.created as price_updated_at\nFROM anistock_anime a\nLEFT JOIN anistock_stock s ON s.id = (\n  SELECT id \n  FROM anistock_stock \n  WHERE anime = a.id \n  ORDER BY created DESC \n  LIMIT 1\n)",
    "viewRule": ""
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3371642188");

  return app.delete(collection);
})
