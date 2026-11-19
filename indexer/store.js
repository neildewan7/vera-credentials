// Local JSON-file store matching schema.sql's table shape. Stand-in until a
// real Supabase project exists (issue #12) — the tables and row shapes here
// are deliberately identical to schema.sql, so swapping this file for a
// Postgres client later shouldn't require changing listener.js at all.

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");

const EMPTY = {
  issuers: [],
  registries: [],
  documents: [],
  self_reported: [],
  credential_links: [],
  revocations: [],
};

function load() {
  if (!fs.existsSync(DATA_FILE)) return structuredClone(EMPTY);
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function upsert(table, row, keyFields) {
  const data = load();
  const matches = (r) => keyFields.every((k) => r[k] === row[k]);
  const idx = data[table].findIndex(matches);
  if (idx >= 0) {
    data[table][idx] = { ...data[table][idx], ...row };
  } else {
    data[table].push(row);
  }
  save(data);
}

module.exports = { load, save, upsert, DATA_FILE };
