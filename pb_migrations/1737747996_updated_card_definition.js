/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("3c4450f19gbojlm")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "tcfxfx5b",
    "name": "mod_operation",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "addition",
        "subtraction",
        "multiplication",
        "division",
        "replace"
      ]
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("3c4450f19gbojlm")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "tcfxfx5b",
    "name": "mod_operation",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "addition",
        "subtraction",
        "multiplication",
        "division"
      ]
    }
  }))

  return dao.saveCollection(collection)
})
