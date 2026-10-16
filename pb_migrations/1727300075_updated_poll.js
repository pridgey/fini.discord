/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("il6j8t01dqkoe8d")

  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_aAt4fPa` ON `poll` (`slug`)"
  ]

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("il6j8t01dqkoe8d")

  collection.indexes = []

  return dao.saveCollection(collection)
})
