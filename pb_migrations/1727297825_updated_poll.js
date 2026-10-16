/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("il6j8t01dqkoe8d")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "hlg9txvr",
    "name": "users_can_add",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "iarrq8sn",
    "name": "single_vote",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("il6j8t01dqkoe8d")

  // remove
  collection.schema.removeField("hlg9txvr")

  // remove
  collection.schema.removeField("iarrq8sn")

  return dao.saveCollection(collection)
})
