/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_526743865")

  // remove field
  collection.fields.removeById("number3354388270")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_526743865")

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "number3354388270",
    "max": null,
    "min": null,
    "name": "total_pages_override",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
})
