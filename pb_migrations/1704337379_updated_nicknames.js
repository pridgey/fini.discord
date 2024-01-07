/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("d8tbovsfrbp41he")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "qgmw4myt",
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
  const collection = dao.findCollectionByNameOrId("d8tbovsfrbp41he")

  // remove
  collection.schema.removeField("qgmw4myt")

  return dao.saveCollection(collection)
})
