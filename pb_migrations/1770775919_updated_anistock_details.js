/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3371642188")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT \n  a.id,\n  a.title,\n  a.image_url,\n  a.mal_id,\n  a.season,\n  a.year,\n  a.status,\n  a.synopsis,\n  s.stock_price as latest_price,\n  s.popularity as latest_popularity,\n  s.members as latest_members,\n  s.favorites as latest_favorites,\n  s.rank as latest_rank,\n  s.score as latest_score,\n  s.created as price_updated_at\nFROM anistock_anime a\nLEFT JOIN anistock_stock s ON s.id = (\n  SELECT id \n  FROM anistock_stock \n  WHERE anime = a.id \n  ORDER BY created DESC \n  LIMIT 1\n)"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_MzIV")

  // remove field
  collection.fields.removeById("_clone_TBUJ")

  // remove field
  collection.fields.removeById("_clone_32ob")

  // remove field
  collection.fields.removeById("_clone_HUH6")

  // remove field
  collection.fields.removeById("_clone_GLbS")

  // remove field
  collection.fields.removeById("_clone_AHWv")

  // remove field
  collection.fields.removeById("_clone_JcUh")

  // remove field
  collection.fields.removeById("_clone_snDg")

  // remove field
  collection.fields.removeById("_clone_scjk")

  // remove field
  collection.fields.removeById("_clone_Chat")

  // remove field
  collection.fields.removeById("_clone_EAeN")

  // remove field
  collection.fields.removeById("_clone_ACs9")

  // remove field
  collection.fields.removeById("_clone_7srm")

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_wklQ",
    "max": 0,
    "min": 0,
    "name": "title",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_xxcW",
    "max": 0,
    "min": 0,
    "name": "image_url",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "_clone_QzrX",
    "max": null,
    "min": null,
    "name": "mal_id",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "_clone_g7cI",
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
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "_clone_M7Av",
    "max": null,
    "min": null,
    "name": "year",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "_clone_dnH1",
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
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_kumx",
    "max": 0,
    "min": 0,
    "name": "synopsis",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "_clone_L6SP",
    "max": null,
    "min": null,
    "name": "latest_price",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "_clone_phF7",
    "max": null,
    "min": null,
    "name": "latest_popularity",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "hidden": false,
    "id": "_clone_n4WR",
    "max": null,
    "min": null,
    "name": "latest_members",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "_clone_U6IS",
    "max": null,
    "min": null,
    "name": "latest_favorites",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "_clone_cTkZ",
    "max": null,
    "min": null,
    "name": "latest_rank",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "_clone_q9IU",
    "max": null,
    "min": null,
    "name": "latest_score",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(14, new Field({
    "hidden": false,
    "id": "_clone_QSY6",
    "name": "price_updated_at",
    "onCreate": true,
    "onUpdate": false,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3371642188")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT \n  a.id,\n  a.title,\n  a.image_url,\n  a.mal_id,\n  a.season,\n  a.year,\n  a.status,\n  s.stock_price as latest_price,\n  s.popularity as latest_popularity,\n  s.members as latest_members,\n  s.favorites as latest_favorites,\n  s.rank as latest_rank,\n  s.score as latest_score,\n  s.created as price_updated_at\nFROM anistock_anime a\nLEFT JOIN anistock_stock s ON s.id = (\n  SELECT id \n  FROM anistock_stock \n  WHERE anime = a.id \n  ORDER BY created DESC \n  LIMIT 1\n)"
  }, collection)

  // add field
  collection.fields.addAt(1, new Field({
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
  }))

  // add field
  collection.fields.addAt(2, new Field({
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
  }))

  // add field
  collection.fields.addAt(3, new Field({
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
  }))

  // add field
  collection.fields.addAt(4, new Field({
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
  }))

  // add field
  collection.fields.addAt(5, new Field({
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
  }))

  // add field
  collection.fields.addAt(6, new Field({
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
  }))

  // add field
  collection.fields.addAt(7, new Field({
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
  }))

  // add field
  collection.fields.addAt(8, new Field({
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
  }))

  // add field
  collection.fields.addAt(9, new Field({
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
  }))

  // add field
  collection.fields.addAt(10, new Field({
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
  }))

  // add field
  collection.fields.addAt(11, new Field({
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
  }))

  // add field
  collection.fields.addAt(12, new Field({
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
  }))

  // add field
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "_clone_7srm",
    "name": "price_updated_at",
    "onCreate": true,
    "onUpdate": false,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))

  // remove field
  collection.fields.removeById("_clone_wklQ")

  // remove field
  collection.fields.removeById("_clone_xxcW")

  // remove field
  collection.fields.removeById("_clone_QzrX")

  // remove field
  collection.fields.removeById("_clone_g7cI")

  // remove field
  collection.fields.removeById("_clone_M7Av")

  // remove field
  collection.fields.removeById("_clone_dnH1")

  // remove field
  collection.fields.removeById("_clone_kumx")

  // remove field
  collection.fields.removeById("_clone_L6SP")

  // remove field
  collection.fields.removeById("_clone_phF7")

  // remove field
  collection.fields.removeById("_clone_n4WR")

  // remove field
  collection.fields.removeById("_clone_U6IS")

  // remove field
  collection.fields.removeById("_clone_cTkZ")

  // remove field
  collection.fields.removeById("_clone_q9IU")

  // remove field
  collection.fields.removeById("_clone_QSY6")

  return app.save(collection)
})
