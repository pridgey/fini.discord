/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2455293247")

  // add field
  collection.fields.addAt(14, new Field({
    "hidden": false,
    "id": "file2370995420",
    "maxSelect": 1,
    "maxSize": 20971520,
    "mimeTypes": [
      "image/gif"
    ],
    "name": "animation",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2455293247")

  // remove field
  collection.fields.removeById("file2370995420")

  return app.save(collection)
})
