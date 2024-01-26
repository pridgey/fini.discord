/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("v13cb0fflbeetij")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "kjge4ujm",
    "name": "user_id",
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
  collection.schema.removeField("kjge4ujm")

  return dao.saveCollection(collection)
})
