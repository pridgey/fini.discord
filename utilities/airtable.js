const Airtable = require("airtable");
require("dotenv").config();

// Connect to Airtable Base
const base = new Airtable({ apiKey: process.env.AIRTABLE_KEY }).base(
  process.env.AIRTABLE_BASE
);

module.exports = { base };
