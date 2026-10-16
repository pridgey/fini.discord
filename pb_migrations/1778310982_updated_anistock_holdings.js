/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2637984545")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT\n  h.id,\n  h.user_id,\n  h.server_id,\n  h.anime,\n  h.shares_owned,\n  h.total_invested,\n  h.total_shares_bought,\n  h.avg_buy_price,\n  h.current_value,\n  d.latest_price as current_price,\n  d.title,\n  d.image_url,\n  d.year,\n  d.season,\n  d.status\nFROM (\n  SELECT\n(CAST(t.user_id AS TEXT) || '_' || t.anime) as id,\n ('u' || CAST(t.user_id AS TEXT)) as user_id,\n('s' || CAST(t.server_id AS TEXT)) as server_id,\n    t.anime,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) as shares_owned,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) as total_invested,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END) as total_shares_bought,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) * 1.0 /\n      NULLIF(SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END), 0) as avg_buy_price,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) *\n      (SELECT s.stock_price FROM anistock_stock s WHERE s.anime = t.anime ORDER BY s.created DESC LIMIT 1) as current_value\n  FROM anistock_transactions t\n  GROUP BY t.user_id, t.server_id, t.anime\n  HAVING SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) > 0\n) h\nLEFT JOIN anistock_details d ON d.id = h.anime"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_w1BT")

  // remove field
  collection.fields.removeById("_clone_oyBT")

  // remove field
  collection.fields.removeById("_clone_QOuI")

  // remove field
  collection.fields.removeById("_clone_6UYt")

  // remove field
  collection.fields.removeById("_clone_ruXQ")

  // remove field
  collection.fields.removeById("_clone_u4iq")

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "_clone_AVy8",
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
    "id": "_clone_shpt",
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
    "id": "_clone_2ojc",
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
    "id": "_clone_xCqx",
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
    "id": "_clone_j2YS",
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
    "id": "_clone_jzLG",
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
    "viewQuery": "SELECT\n  h.id,\n  h.user_id,\n  h.server_id,\n  h.anime,\n  h.shares_owned,\n  h.total_invested,\n  h.total_shares_bought,\n  h.avg_buy_price,\n  h.current_value,\n  d.latest_price as current_price,\n  d.title,\n  d.image_url,\n  d.year,\n  d.season,\n  d.status\nFROM (\n  SELECT\n(CAST(t.user_id AS TEXT) || '_' || t.anime) as id,\n  CAST(t.user_id AS TEXT) as user_id,\n  CAST(t.server_id AS TEXT) as server_id,\n    t.anime,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) as shares_owned,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) as total_invested,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END) as total_shares_bought,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) * 1.0 /\n      NULLIF(SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END), 0) as avg_buy_price,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) *\n      (SELECT s.stock_price FROM anistock_stock s WHERE s.anime = t.anime ORDER BY s.created DESC LIMIT 1) as current_value\n  FROM anistock_transactions t\n  GROUP BY t.user_id, t.server_id, t.anime\n  HAVING SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) > 0\n) h\nLEFT JOIN anistock_details d ON d.id = h.anime"
  }, collection)

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "_clone_w1BT",
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
    "id": "_clone_oyBT",
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
    "id": "_clone_QOuI",
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
    "id": "_clone_6UYt",
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
    "id": "_clone_ruXQ",
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
    "id": "_clone_u4iq",
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

  // remove field
  collection.fields.removeById("_clone_AVy8")

  // remove field
  collection.fields.removeById("_clone_shpt")

  // remove field
  collection.fields.removeById("_clone_2ojc")

  // remove field
  collection.fields.removeById("_clone_xCqx")

  // remove field
  collection.fields.removeById("_clone_j2YS")

  // remove field
  collection.fields.removeById("_clone_jzLG")

  return app.save(collection)
})
