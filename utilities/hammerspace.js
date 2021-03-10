const { base } = require("./airtable");
const seedrandom = require("seedrandom");
const { escapeString } = require("./escapeString");

const getRandomCollection = () => {
  return base("Collections")
    .select()
    .all()
    .then((results) => {
      const collections = results.map((result) => result.fields);
      const rng = seedrandom();
      const random = Math.round(rng() * collections.length - 1);

      // Return a random collection
      return collections[random].Collection;
    });
};

const getRandomPhrase = () => {
  return base("Phrases")
    .select()
    .all()
    .then((results) => {
      const phrases = results.map((result) => result.fields);
      const rng = seedrandom();
      const random = Math.round(rng() * phrases.length - 1);

      // Return a random phrase
      return phrases[random].Phrase;
    });
};

const getMultiplePhrases = (count) => {
  if (count > 0) {
    return base("Phrases")
      .select()
      .all()
      .then((results) => {
        const phrases = results.map((result) => result.fields);
        const rng = seedrandom();

        const resultsArray = [];

        for (let i = 0; i < count; i++) {
          const random = Math.round(rng() * phrases.length - 1);
          resultsArray.push(phrases[random].Phrase);
        }

        return resultsArray;
      });
  } else {
    return [];
  }
};

const getRandomSentence = () => {
  return base("Sentences")
    .select()
    .all()
    .then((results) => {
      const sentences = results.map((result) => result.fields);
      const rng = seedrandom();
      const random = Math.round(rng() * sentences.length - 1);

      // Return a random sentence
      return sentences[random].Sentence;
    });
};

const getHammerspaceItem = (mode) => {
  return base("Hammerspace")
    .select()
    .all()
    .then((results) => {
      const nouns = results.map((result) => result.fields);
      const rng = seedrandom();
      const random = Math.round(rng() * nouns.length - 1);

      const hammerspaceEntry = nouns[random];

      if (mode === "multiple") {
        // Grab multiple
        return hammerspaceEntry.Plural;
      } else if (mode === "singular") {
        // Grab singular
        return hammerspaceEntry.Singular;
      } else if (Math.round(Math.random()) === 0) {
        // If not specified, pick randomly
        return hammerspaceEntry.Singular;
      } else {
        return hammerspaceEntry.Plural;
      }
    });
};

// Gekin specific

const addGekinzukuItem = (item, user) => {
  return base("Gekinzuku").create([
    {
      fields: {
        Item: item.trim(),
        User: user,
        TimesUsed: 0,
      },
    },
  ]);
};

const getGekinzukuItem = () => {
  return base("Gekinzuku")
    .select()
    .all()
    .then((results) => {
      const nouns = results.map((result) => result.fields);
      const rng = seedrandom();
      const random = Math.round(rng() * nouns.length - 1);

      return nouns[random].Item;
    });
};

const getMultipleGekinzukuItems = (count) => {
  if (count > 0) {
    return base("Gekinzuku")
      .select()
      .all()
      .then((results) => {
        const nouns = results.map((result) => result.fields);
        const rng = seedrandom();

        const resultsArray = [];

        for (let i = 0; i < count; i++) {
          const random = Math.round(rng() * nouns.length - 1);
          resultsArray.push(nouns[random].Item);
        }

        return resultsArray;
      });
  } else {
    return [];
  }
};

const searchGekinzukuItems = (itemName) => {
  return base("Gekinzuku")
    .select({
      fields: ["Item", "User", "DateCreated", "TimesUsed"],
      filterByFormula: `LOWER(Item) = '${escapeString(
        itemName.trim().toLowerCase()
      )}'`,
    })
    .all()
    .then((results) => {
      const item = results.map((result) => result.fields);

      return item[0];
    });
};

const updateGekinStat = (itemName) => {
  base("Gekinzuku")
    .select({
      fields: ["TimesUsed"],
      filterByFormula: `LOWER(item) = '${escapeString(
        itemName.trim().toLowerCase()
      )}'`,
    })
    .all()
    .then((results) => {
      const recordID = results[0].id;
      const fields = results.map((result) => result.fields);

      base("Gekinzuku").update([
        {
          id: recordID,
          fields: {
            TimesUsed: Number(fields[0].TimesUsed ?? 0) + 1,
          },
        },
      ]);
    });
};

module.exports = {
  getHammerspaceItem,
  getGekinzukuItem,
  getMultipleGekinzukuItems,
  getRandomCollection,
  getRandomPhrase,
  getMultiplePhrases,
  getRandomSentence,
  addGekinzukuItem,
  searchGekinzukuItems,
  updateGekinStat,
};
