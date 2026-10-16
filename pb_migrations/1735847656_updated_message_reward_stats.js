/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("fsi8h5tjera1kl8")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "vivbzx3f",
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
  const collection = dao.findCollectionByNameOrId("fsi8h5tjera1kl8")

  // remove
  collection.schema.removeField("vivbzx3f")

  return dao.saveCollection(collection)
})
