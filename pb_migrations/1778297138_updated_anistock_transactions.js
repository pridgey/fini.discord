/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("vbxkeh19vw7leq9")

  // update field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "select1916208593",
    "maxSelect": 1,
    "name": "action",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "BUY",
      "SELL"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("vbxkeh19vw7leq9")

  // update field
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

  return app.save(collection)
})
