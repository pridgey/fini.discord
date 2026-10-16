/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2637984545")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT\n  h.id,\n  h.user_id,\n  h.server_id,\n  h.anime,\n  h.shares_owned,\n  h.total_invested,\n  h.total_shares_bought,\n  h.avg_buy_price,\n  h.current_value,\n  d.latest_price as current_price,\n  d.title,\n  d.image_url,\n  d.year,\n  d.season,\n  d.status\nFROM (\n  SELECT\n    (t.user_id || '_' || t.anime) as id,\n    t.user_id,\n    t.server_id,\n    t.anime,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) as shares_owned,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) as total_invested,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END) as total_shares_bought,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) * 1.0 /\n      NULLIF(SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END), 0) as avg_buy_price,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) *\n      (SELECT s.stock_price FROM anistock_stock s WHERE s.anime = t.anime ORDER BY s.created DESC LIMIT 1) as current_value\n  FROM anistock_transactions t\n  GROUP BY t.user_id, t.server_id, t.anime\n  HAVING SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) > 0\n) h\nLEFT JOIN anistock_details d ON d.id = h.anime"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_Gdqp")

  // remove field
  collection.fields.removeById("_clone_rEKn")

  // remove field
  collection.fields.removeById("_clone_fczv")

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "_clone_HQVF",
    "max": null,
    "min": null,
    "name": "current_price",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_VAqi",
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
  collection.fields.addAt(11, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_S8LK",
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
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "_clone_0YEn",
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
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "_clone_jupI",
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
  collection.fields.addAt(14, new Field({
    "hidden": false,
    "id": "_clone_S9g6",
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

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2637984545")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT\n  h.id,\n  h.user_id,\n  h.server_id,\n  h.anime,\n  h.shares_owned,\n  h.total_invested,\n  h.total_shares_bought,\n  h.avg_buy_price,\n  h.current_value,\n  d.latest_price as current_price,\n  d.title,\n  d.image_url\nFROM (\n  SELECT\n    (t.user_id || '_' || t.anime) as id,\n    t.user_id,\n    t.server_id,\n    t.anime,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) as shares_owned,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) as total_invested,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END) as total_shares_bought,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) * 1.0 /\n      NULLIF(SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END), 0) as avg_buy_price,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) *\n      (SELECT s.stock_price FROM anistock_stock s WHERE s.anime = t.anime ORDER BY s.created DESC LIMIT 1) as current_value\n  FROM anistock_transactions t\n  GROUP BY t.user_id, t.server_id, t.anime\n  HAVING SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) > 0\n) h\nLEFT JOIN anistock_details d ON d.id = h.anime"
  }, collection)

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "_clone_Gdqp",
    "max": null,
    "min": null,
    "name": "current_price",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_rEKn",
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
  collection.fields.addAt(11, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_fczv",
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

  // remove field
  collection.fields.removeById("_clone_HQVF")

  // remove field
  collection.fields.removeById("_clone_VAqi")

  // remove field
  collection.fields.removeById("_clone_S8LK")

  // remove field
  collection.fields.removeById("_clone_0YEn")

  // remove field
  collection.fields.removeById("_clone_jupI")

  // remove field
  collection.fields.removeById("_clone_S9g6")

  return app.save(collection)
})
