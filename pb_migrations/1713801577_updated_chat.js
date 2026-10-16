/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("n1q7tqy9ipink8i")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "0dndelum",
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
  const collection = dao.findCollectionByNameOrId("n1q7tqy9ipink8i")

  // remove
  collection.schema.removeField("0dndelum")

  return dao.saveCollection(collection)
})
