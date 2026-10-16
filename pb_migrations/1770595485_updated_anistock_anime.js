/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oms7qgojctcoi7l")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "nvprzdod",
    "name": "synopsis",
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
  const collection = dao.findCollectionByNameOrId("oms7qgojctcoi7l")

  // remove
  collection.schema.removeField("nvprzdod")

  return dao.saveCollection(collection)
})
