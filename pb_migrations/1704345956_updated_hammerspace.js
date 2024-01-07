/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("y3yb78k8bezx5pg")

  collection.listRule = ""
  collection.viewRule = ""
  collection.updateRule = ""
  collection.deleteRule = ""

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("y3yb78k8bezx5pg")

  collection.listRule = null
  collection.viewRule = null
  collection.updateRule = null
  collection.deleteRule = null

  return dao.saveCollection(collection)
})
