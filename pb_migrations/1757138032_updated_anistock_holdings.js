/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("vbxkeh19vw7leq9")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "xe33th3y",
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
  const collection = dao.findCollectionByNameOrId("vbxkeh19vw7leq9")

  // remove
  collection.schema.removeField("xe33th3y")

  return dao.saveCollection(collection)
})
