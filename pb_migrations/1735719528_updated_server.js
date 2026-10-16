/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("i1h3zyqlpxh9dik")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "opou335c",
    "name": "servername",
    "type": "text",
    "required": false,
    "presentable": true,
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
  const collection = dao.findCollectionByNameOrId("i1h3zyqlpxh9dik")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "opou335c",
    "name": "servername",
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
})
