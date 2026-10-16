/**
 * Applies the web mailbox's schema over its API.
 *
 *   bun --env-file=.env run scripts/finicards_v2_web_schema.ts
 *
 * The schema lives in `web/pocketbase/pb_migrations/` as ordinary Pocketbase
 * migrations. A hosted mailbox may not offer a way to drop files beside the
 * server, so this runs those same files from here: it stands in for the few
 * things a migration touches (`app`, `Collection`, `Field`) and turns each
 * save into an API call, made as the mailbox's superuser.
 *
 * Which files have been applied is kept in the mailbox itself (`web_schema`),
 * so running this again only applies what is new. Use this or the server's
 * own migrations for a mailbox - not both, or the second will find the
 * collections already there.
 */
import { readdirSync } from "fs";
import { join, resolve } from "path";
import { remote, remoteUrl, signIn, webSyncEnabled } from "../modules/finicards/webSync";

const MIGRATIONS = resolve(import.meta.dir, "../web/pocketbase/pb_migrations");
const APPLIED = "web_schema";

if (!webSyncEnabled()) {
  console.error("Set the FINI_WEB_POCKETBASE_* settings first.");
  process.exit(1);
}

type Json = Record<string, any>;
type Step = { kind: "create" | "update" | "delete"; id: string; name: string; body?: Json };

/** A collection's field list, with the handful of methods migrations use. */
const fieldList = (fields: Json[]): Json[] =>
  Object.assign(fields, {
    add(field: Json) {
      const at = fields.findIndex((existing) => existing.name === field.name);
      if (at >= 0) fields[at] = { ...fields[at], ...field };
      else fields.push(field);
    },
    getByName: (name: string) => fields.find((field) => field.name === name),
    removeByName(name: string) {
      const at = fields.findIndex((field) => field.name === name);
      if (at >= 0) fields.splice(at, 1);
    },
  });

const randomId = (): string =>
  `pbc_${Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join("")}`;

await signIn();
const existing = new Map<string, Json>();
for (const collection of await remote.collections.getFullList()) {
  existing.set(collection.name, collection as Json);
}

/** Everything a migration asked for, in order, to be sent once it has run. */
let steps: Step[] = [];
const known = new Map<string, Json>();

const adopt = (collection: Json): Json => {
  collection.fields = fieldList(collection.fields ?? []);
  known.set(collection.name, collection);
  return collection;
};

Object.assign(globalThis, {
  // An id up front, because a migration reads it straight after saving.
  Collection: function (this: Json, data: Json) {
    Object.assign(this, { id: randomId(), ...data });
    this.fields = fieldList([...(data.fields ?? [])]);
  },
  Field: function (this: Json, data: Json) {
    Object.assign(this, data);
  },
});

const app = {
  findCollectionByNameOrId(name: string): Json {
    const found =
      known.get(name) ?? (existing.has(name) ? adopt(structuredClone(existing.get(name)!)) : null);
    if (!found) throw new Error(`no collection called ${name}`);
    return found;
  },
  save(collection: Json) {
    const { id, created, updated, system, ...body } = JSON.parse(JSON.stringify(collection));
    const there = existing.has(collection.name) || steps.some((step) => step.id === id);
    known.set(collection.name, collection);
    steps.push({
      kind: there ? "update" : "create",
      id,
      name: collection.name,
      body: there ? body : { id, ...body },
    });
  },
  delete(collection: Json) {
    steps.push({ kind: "delete", id: collection.id, name: collection.name });
  },
};

const migrations: { file: string; up: (app: unknown) => void }[] = [];
let loading = "";
(globalThis as Json).migrate = (up: (app: unknown) => void) => migrations.push({ file: loading, up });

for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".js")).sort()) {
  loading = file;
  await import(join(MIGRATIONS, file));
}

if (!existing.has(APPLIED)) {
  await remote.collections.create({
    name: APPLIED,
    type: "base",
    fields: [{ name: "file", type: "text", required: true }],
    indexes: [`CREATE UNIQUE INDEX idx_${APPLIED}_file ON ${APPLIED} (file)`],
  });
}
const applied = new Set(
  (await remote.collection(APPLIED).getFullList()).map((row) => row.file as string),
);

const RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"] as const;

/**
 * Reads back what was just sent and lists anything the mailbox did not take:
 * a rule, or whether a field must be filled in. A save that is accepted is
 * not always a save that was kept, and a rule that silently stayed open is
 * exactly the kind of thing worth being told about.
 */
const notApplied = async (sent: Step[]): Promise<string[]> => {
  const last = new Map<string, Step>();
  for (const step of sent) if (step.kind !== "delete") last.set(step.id, step);
  const problems: string[] = [];
  for (const step of last.values()) {
    const now = (await remote.collections.getOne(step.id)) as Json;
    for (const rule of RULES) {
      if (rule in (step.body ?? {}) && (step.body![rule] ?? null) !== (now[rule] ?? null)) {
        problems.push(`${step.name}.${rule} is ${JSON.stringify(now[rule])}, wanted ${JSON.stringify(step.body![rule])}`);
      }
    }
    for (const field of (step.body?.fields ?? []) as Json[]) {
      const kept = (now.fields as Json[]).find((other) => other.name === field.name);
      if (!kept) problems.push(`${step.name}.${field.name} is missing`);
      else if (!!field.required !== !!kept.required) {
        problems.push(`${step.name}.${field.name} required is ${!!kept.required}, wanted ${!!field.required}`);
      }
    }
  }
  return problems;
};
const missed: string[] = [];

console.log(`Mailbox: ${remoteUrl()}`);

// Fini sends its changes many to a request; a hosted mailbox counts requests.
const settings = await remote.settings.getAll();
if (!settings.batch?.enabled || settings.batch.maxRequests < 50) {
  await remote.settings.update({
    batch: { enabled: true, maxRequests: 100, timeout: 60, maxBodySize: 0 },
  });
  console.log("  switched on      batch requests");
}
for (const migration of migrations) {
  if (applied.has(migration.file)) {
    console.log(`  already applied  ${migration.file}`);
    continue;
  }
  steps = [];
  migration.up(app);
  for (const step of steps) {
    if (step.kind === "create") await remote.collections.create(step.body);
    else if (step.kind === "update") await remote.collections.update(step.id, step.body);
    else await remote.collections.delete(step.id);
    // Later files look collections up by name; let them find this one.
    if (step.kind !== "delete") existing.set(step.name, { id: step.id, ...step.body });
  }
  await remote.collection(APPLIED).create({ file: migration.file });
  console.log(`  applied          ${migration.file}  (${steps.length} changes)`);
  missed.push(...(await notApplied(steps)));
}
if (missed.length) {
  console.error("\nThe mailbox did not keep everything it was sent:");
  for (const problem of missed) console.error(`  ${problem}`);
  process.exit(1);
}
process.exit(0);
