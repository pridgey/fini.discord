/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2637984545")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT\n  h.id,\n  h.identifier,\n  h.user_id,\n  h.server_id,\n  h.anime,\n  h.shares_owned,\n  h.total_spent,\n  h.total_received,\n  h.total_invested,\n  h.total_shares_bought,\n  h.avg_buy_price,\n  h.current_value,\n  d.latest_price as current_price,\n  d.title,\n  d.image_url,\n  d.year,\n  d.season,\n  d.status\nFROM (\n  SELECT\n(CAST(t.user_id AS TEXT) || '_' || CAST(t.server_id AS TEXT) || '_' || t.anime) as id,\n ('u' || CAST(t.user_id AS TEXT)) as user_id,\n('s' || CAST(t.server_id AS TEXT)) as server_id,\n    t.anime,\n  t.identifier,\n  SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) as total_spent,\nSUM(CASE WHEN t.action = 'SELL' THEN t.shares * t.price ELSE 0 END) as total_received,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) as shares_owned,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) as total_invested,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END) as total_shares_bought,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) * 1.0 /\n      NULLIF(SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END), 0) as avg_buy_price,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) *\n      (SELECT s.stock_price FROM anistock_stock s WHERE s.anime = t.anime ORDER BY s.created DESC LIMIT 1) as current_value\n  FROM anistock_transactions t\n  GROUP BY t.user_id, t.server_id, t.anime\n  HAVING SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) > 0\n) h\nLEFT JOIN anistock_details d ON d.id = h.anime"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_JDYt")

  // remove field
  collection.fields.removeById("_clone_U9kr")

  // remove field
  collection.fields.removeById("_clone_LwRV")

  // remove field
  collection.fields.removeById("_clone_Qcrf")

  // remove field
  collection.fields.removeById("_clone_QgZJ")

  // remove field
  collection.fields.removeById("_clone_W0l7")

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "_clone_XZc0",
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
  collection.fields.addAt(13, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_G2N1",
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
  collection.fields.addAt(14, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_8fHD",
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
  collection.fields.addAt(15, new Field({
    "hidden": false,
    "id": "_clone_KgpZ",
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
  collection.fields.addAt(16, new Field({
    "hidden": false,
    "id": "_clone_147P",
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
  collection.fields.addAt(17, new Field({
    "hidden": false,
    "id": "_clone_640L",
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
    "viewQuery": "SELECT\n  h.id,\n  h.identifier,\n  h.user_id,\n  h.server_id,\n  h.anime,\n  h.shares_owned,\n  h.total_spent,\n  h.total_received,\n  h.total_invested,\n  h.total_shares_bought,\n  h.avg_buy_price,\n  h.current_value,\n  d.latest_price as current_price,\n  d.title,\n  d.image_url,\n  d.year,\n  d.season,\n  d.status\nFROM (\n  SELECT\n(CAST(t.user_id AS TEXT) || '_' || t.anime) as id,\n ('u' || CAST(t.user_id AS TEXT)) as user_id,\n('s' || CAST(t.server_id AS TEXT)) as server_id,\n    t.anime,\n  t.identifier,\n  SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) as total_spent,\nSUM(CASE WHEN t.action = 'SELL' THEN t.shares * t.price ELSE 0 END) as total_received,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) as shares_owned,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) as total_invested,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END) as total_shares_bought,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) * 1.0 /\n      NULLIF(SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END), 0) as avg_buy_price,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) *\n      (SELECT s.stock_price FROM anistock_stock s WHERE s.anime = t.anime ORDER BY s.created DESC LIMIT 1) as current_value\n  FROM anistock_transactions t\n  GROUP BY t.user_id, t.server_id, t.anime\n  HAVING SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) > 0\n) h\nLEFT JOIN anistock_details d ON d.id = h.anime"
  }, collection)

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "_clone_JDYt",
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
  collection.fields.addAt(13, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_U9kr",
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
  collection.fields.addAt(14, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_LwRV",
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
  collection.fields.addAt(15, new Field({
    "hidden": false,
    "id": "_clone_Qcrf",
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
  collection.fields.addAt(16, new Field({
    "hidden": false,
    "id": "_clone_QgZJ",
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
  collection.fields.addAt(17, new Field({
    "hidden": false,
    "id": "_clone_W0l7",
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
  collection.fields.removeById("_clone_XZc0")

  // remove field
  collection.fields.removeById("_clone_G2N1")

  // remove field
  collection.fields.removeById("_clone_8fHD")

  // remove field
  collection.fields.removeById("_clone_KgpZ")

  // remove field
  collection.fields.removeById("_clone_147P")

  // remove field
  collection.fields.removeById("_clone_640L")

  return app.save(collection)
})
