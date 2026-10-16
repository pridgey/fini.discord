/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("n1q7tqy9ipink8i")

  // remove
  collection.schema.removeField("krewrjj2")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "aifauzpx",
    "name": "attachment",
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
  const collection = dao.findCollectionByNameOrId("n1q7tqy9ipink8i")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "krewrjj2",
    "name": "attachments",
    "type": "file",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "mimeTypes": [],
      "thumbs": [],
      "maxSelect": 99,
      "maxSize": 5242880,
      "protected": false
    }
  }))

  // remove
  collection.schema.removeField("aifauzpx")

  return dao.saveCollection(collection)
})
