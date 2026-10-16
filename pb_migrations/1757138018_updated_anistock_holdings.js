/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("vbxkeh19vw7leq9")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "v04ue053",
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

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "tbqze1ll",
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
  const collection = dao.findCollectionByNameOrId("vbxkeh19vw7leq9")

  // remove
  collection.schema.removeField("v04ue053")

  // remove
  collection.schema.removeField("tbqze1ll")

  return dao.saveCollection(collection)
})
