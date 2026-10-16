/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("eo5o6nuz8a6ut8e")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "qwdynpbf",
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

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "yz7ilgx9",
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

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "i1cfs1f8",
    "name": "card",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "3c4450f19gbojlm",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("eo5o6nuz8a6ut8e")

  // remove
  collection.schema.removeField("qwdynpbf")

  // remove
  collection.schema.removeField("yz7ilgx9")

  // remove
  collection.schema.removeField("i1cfs1f8")

  return dao.saveCollection(collection)
})
