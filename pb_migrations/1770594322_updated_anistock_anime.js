/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oms7qgojctcoi7l")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "sbsguokb",
    "name": "status",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "upcoming",
        "finished",
        "ongoing"
      ]
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oms7qgojctcoi7l")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "sbsguokb",
    "name": "status",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "upcoming",
        "airing",
        "finished",
        "ongoing"
      ]
    }
  }))

  return dao.saveCollection(collection)
})
