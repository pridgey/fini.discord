/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("f0h41l6nkti4ark")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "6cedy7le",
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
  const collection = dao.findCollectionByNameOrId("f0h41l6nkti4ark")

  // remove
  collection.schema.removeField("6cedy7le")

  return dao.saveCollection(collection)
})
