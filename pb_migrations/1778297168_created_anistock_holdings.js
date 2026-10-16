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
        "hidden": false,
        "id": "json2809058197",
        "maxSize": 1,
        "name": "user_id",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json407168695",
        "maxSize": 1,
        "name": "server_id",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json319052098",
        "maxSize": 1,
        "name": "anime",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json1738742896",
        "maxSize": 1,
        "name": "shares_owned",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json998161484",
        "maxSize": 1,
        "name": "total_invested",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json2994742574",
        "maxSize": 1,
        "name": "total_shares_bought",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json946992123",
        "maxSize": 1,
        "name": "avg_buy_price",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "json3110678320",
        "maxSize": 1,
        "name": "current_value",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "_clone_H3oY",
        "max": null,
        "min": null,
        "name": "current_price",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "_clone_3Ln8",
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
        "id": "_clone_fIfq",
        "max": 0,
        "min": 0,
        "name": "image_url",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      }
    ],
    "id": "pbc_2637984545",
    "indexes": [],
    "listRule": null,
    "name": "anistock_holdings",
    "system": false,
    "type": "view",
    "updateRule": null,
    "viewQuery": "SELECT\n  h.id,\n  h.user_id,\n  h.server_id,\n  h.anime,\n  h.shares_owned,\n  h.total_invested,\n  h.total_shares_bought,\n  h.avg_buy_price,\n  h.current_value,\n  d.latest_price as current_price,\n  d.title,\n  d.image_url\nFROM (\n  SELECT\n    (t.user_id || '_' || t.anime) as id,\n    t.user_id,\n    t.server_id,\n    t.anime,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) as shares_owned,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) as total_invested,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END) as total_shares_bought,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares * t.price ELSE 0 END) * 1.0 /\n      NULLIF(SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE 0 END), 0) as avg_buy_price,\n    SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) *\n      (SELECT s.stock_price FROM anistock_stock s WHERE s.anime = t.anime ORDER BY s.created DESC LIMIT 1) as current_value\n  FROM anistock_transactions t\n  GROUP BY t.user_id, t.server_id, t.anime\n  HAVING SUM(CASE WHEN t.action = 'BUY' THEN t.shares ELSE -t.shares END) > 0\n) h\nLEFT JOIN anistock_details d ON d.id = h.anime",
    "viewRule": null
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2637984545");

  return app.delete(collection);
})
