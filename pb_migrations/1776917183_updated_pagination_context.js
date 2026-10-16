/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_526743865")

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "bool2889535709",
    "name": "wrap",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_526743865")

  // remove field
  collection.fields.removeById("bool2889535709")

  return app.save(collection)
})
