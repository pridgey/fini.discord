/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("3c4450f19gbojlm")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "fqau3bfz",
    "name": "mod_stat",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "strength",
        "agility",
        "endurance",
        "intellect",
        "luck"
      ]
    }
  }))

  // add
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

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "coumi726",
    "name": "mod_value",
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
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("3c4450f19gbojlm")

  // remove
  collection.schema.removeField("fqau3bfz")

  // remove
  collection.schema.removeField("tcfxfx5b")

  // remove
  collection.schema.removeField("coumi726")

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
        "l"
      ]
    }
  }))

  return dao.saveCollection(collection)
})
