/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("inld9sjtgpeocjo")

  collection.name = "anistockstock"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("inld9sjtgpeocjo")

  collection.name = "anistock_stock"

  return dao.saveCollection(collection)
})
