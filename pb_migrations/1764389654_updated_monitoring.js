/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("2t8tpks8ch5cfi3")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "9tms0ef7",
    "name": "identifier",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("2t8tpks8ch5cfi3")

  // remove
  collection.schema.removeField("9tms0ef7")

  return dao.saveCollection(collection)
})
