/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oms7qgojctcoi7l")

  collection.name = "anistock_anime"
  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_qU6MAbT` ON `anistock_anime` (`mal_id`)"
  ]

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oms7qgojctcoi7l")

  collection.name = "anistockanime"
  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_qU6MAbT` ON `anistockanime` (`mal_id`)"
  ]

  return dao.saveCollection(collection)
})
