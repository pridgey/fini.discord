/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("2t8tpks8ch5cfi3")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "muvpmavk",
    "name": "frequency",
    "type": "number",
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "min": 1,
      "max": 60,
      "noDecimal": true
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("2t8tpks8ch5cfi3")

  // remove
  collection.schema.removeField("muvpmavk")

  return dao.saveCollection(collection)
})
