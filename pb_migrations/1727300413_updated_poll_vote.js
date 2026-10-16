/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("eg50he1bd6f75ga")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ojwlgsjq",
    "name": "poll",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "il6j8t01dqkoe8d",
      "cascadeDelete": true,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("eg50he1bd6f75ga")

  // remove
  collection.schema.removeField("ojwlgsjq")

  return dao.saveCollection(collection)
})
