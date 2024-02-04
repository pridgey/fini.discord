/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("y3yb78k8bezx5pg")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "wwub2inz",
    "name": "type",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "item",
        "sentence",
        "phrase"
      ]
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("y3yb78k8bezx5pg")

  // remove
  collection.schema.removeField("wwub2inz")

  return dao.saveCollection(collection)
})
