/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("il6j8t01dqkoe8d")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "rfmhuc7l",
    "name": "slug",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("il6j8t01dqkoe8d")

  // remove
  collection.schema.removeField("rfmhuc7l")

  return dao.saveCollection(collection)
})
