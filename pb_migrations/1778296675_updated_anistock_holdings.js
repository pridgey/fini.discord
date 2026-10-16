/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("vbxkeh19vw7leq9")

  // update collection data
  unmarshal({
    "name": "anistock_transactions"
  }, collection)

  // remove field
  collection.fields.removeById("xmjxazhc")

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "select1916208593",
    "maxSelect": 1,
    "name": "transaction",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "BUY",
      "SELL"
    ]
  }))

  // update field
  collection.fields.addAt(2, new Field({
    "hidden": false,
    "id": "liaut4yw",
    "max": null,
    "min": null,
    "name": "shares",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "rty89j8h",
    "max": null,
    "min": null,
    "name": "price",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("vbxkeh19vw7leq9")

  // update collection data
  unmarshal({
    "name": "anistock_holdings"
  }, collection)

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "xmjxazhc",
    "max": null,
    "min": null,
    "name": "total_invested",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // remove field
  collection.fields.removeById("select1916208593")

  // update field
  collection.fields.addAt(2, new Field({
    "hidden": false,
    "id": "liaut4yw",
    "max": null,
    "min": null,
    "name": "shares_owned",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // update field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "rty89j8h",
    "max": null,
    "min": null,
    "name": "average_cost_per_share",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
})
