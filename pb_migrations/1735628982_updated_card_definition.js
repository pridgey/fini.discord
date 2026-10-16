/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("3c4450f19gbojlm")

  // remove
  collection.schema.removeField("wz2mkdcd")

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("3c4450f19gbojlm")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "wz2mkdcd",
    "name": "description2",
    "type": "editor",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "convertUrls": false
    }
  }))

  return dao.saveCollection(collection)
})
