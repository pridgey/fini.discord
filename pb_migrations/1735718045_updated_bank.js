/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("k8xg84q9j6ekoro")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "eiyruuxy",
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
  const collection = dao.findCollectionByNameOrId("k8xg84q9j6ekoro")

  // remove
  collection.schema.removeField("eiyruuxy")

  return dao.saveCollection(collection)
})
