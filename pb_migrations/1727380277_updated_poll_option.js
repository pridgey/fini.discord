/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("nbo10n4ztz4imv8")

  collection.indexes = []

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("nbo10n4ztz4imv8")

  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_t9SmEFU` ON `poll_option` (`slug`)"
  ]

  return dao.saveCollection(collection)
})
