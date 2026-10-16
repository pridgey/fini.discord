/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_526743865")

  // update field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "json2021091213",
    "maxSize": 0,
    "name": "filter",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_526743865")

  // update field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "json2021091213",
    "maxSize": 0,
    "name": "filters",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
})
