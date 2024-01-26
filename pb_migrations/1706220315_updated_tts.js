/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("v13cb0fflbeetij")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "8o93m5qc",
    "name": "prompt",
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
  const collection = dao.findCollectionByNameOrId("v13cb0fflbeetij")

  // remove
  collection.schema.removeField("8o93m5qc")

  return dao.saveCollection(collection)
})
