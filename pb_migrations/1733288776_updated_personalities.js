/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("g9pn7pgeqv3e712")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "n4gxfmks",
    "name": "server_id",
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
  const collection = dao.findCollectionByNameOrId("g9pn7pgeqv3e712")

  // remove
  collection.schema.removeField("n4gxfmks")

  return dao.saveCollection(collection)
})
