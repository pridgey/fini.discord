/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("inld9sjtgpeocjo")

  // remove
  collection.schema.removeField("brgkf1ca")

  // remove
  collection.schema.removeField("fv9evcxm")

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("inld9sjtgpeocjo")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "brgkf1ca",
    "name": "price_change",
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

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "fv9evcxm",
    "name": "price_change_percent",
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
