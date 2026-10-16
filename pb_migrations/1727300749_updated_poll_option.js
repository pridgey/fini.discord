/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("nbo10n4ztz4imv8")

  // remove
  collection.schema.removeField("h44czmxf")

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("nbo10n4ztz4imv8")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "h44czmxf",
    "name": "option_number",
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
})
