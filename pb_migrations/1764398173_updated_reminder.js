/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("lguhkamujzq8ezx")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "mof1hmv8",
    "name": "original_message",
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
  const collection = dao.findCollectionByNameOrId("lguhkamujzq8ezx")

  // remove
  collection.schema.removeField("mof1hmv8")

  return dao.saveCollection(collection)
})
