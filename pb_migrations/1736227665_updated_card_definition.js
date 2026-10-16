/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("3c4450f19gbojlm")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "xqs2dsie",
    "name": "color",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "item",
        "red",
        "yellow",
        "blue",
        "green",
        "purple",
        "black",
        "light",
        "shadow"
      ]
    }
  }))

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "2w6oygmc",
    "name": "rarity",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "c",
        "u",
        "fa",
        "l",
        "i",
        "ri"
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
    "id": "xqs2dsie",
    "name": "color",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "red",
        "yellow",
        "blue",
        "green",
        "purple",
        "black",
        "light",
        "shadow"
      ]
    }
  }))

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "2w6oygmc",
    "name": "rarity",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "c",
        "u",
        "fa",
        "l",
        "i"
      ]
    }
  }))

  return dao.saveCollection(collection)
})
