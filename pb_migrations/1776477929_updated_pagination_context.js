/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_526743865")

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "number3642470487",
    "max": null,
    "min": null,
    "name": "per_page",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_526743865")

  // remove field
  collection.fields.removeById("number3642470487")

  return app.save(collection)
})
