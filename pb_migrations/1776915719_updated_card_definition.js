/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("3c4450f19gbojlm")

  // add field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "number3216713363",
    "max": null,
    "min": null,
    "name": "rarity_order",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("3c4450f19gbojlm")

  // remove field
  collection.fields.removeById("number3216713363")

  return app.save(collection)
})
