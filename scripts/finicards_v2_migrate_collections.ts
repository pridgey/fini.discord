import { rollCopyKeyword, V2_CARD_DEFINITION, V2_USER_CARD, nextSerial } from "../modules/finicards/cardStore";
import { LEGACY_FOIL_RARITIES } from "../modules/finicards/convertLegacyCards";
import {
  ITEMS_PER_FREE_PACK,
  planFreePacks,
  V2_FREE_PACK,
  type ItemOwner,
} from "../modules/finicards/freePacks";
import type { CardDefinitionRecord, UserCardRecord } from "../types/PocketbaseTables";
import type { V2CardDefinitionRecord, V2UserCardRecord } from "../types/PocketbaseTablesV2";
import { ADMIN_ID } from "../utilities/discord/isAdmin";
import { pb } from "../utilities/pocketbase";

/**
 * The launch migration: v1 collections become v2 collections.
 *
 * RUN ON 2026-10-12. Do not run it again with `--commit`: its first step wipes
 * every v2 copy, deck, dungeon run and battle, which are now real.
 *
 *   bun --env-file=.env run scripts/finicards_v2_migrate_collections.ts
 *   bun --env-file=.env run scripts/finicards_v2_migrate_collections.ts --commit
 *
 * Without `--commit` nothing is written; it reports what would happen.
 *
 * In order:
 *   1. Test data is wiped: every v2 copy, deck, dungeon run and battle made
 *      while v2 was being tested.
 *   2. v1's colour is taken off the converted cards' tags.
 *   3. Every v1 battler a player owns becomes a v2 copy of the same card, with
 *      a keyword rolled for that copy. v1 legendaries come across as full-arts.
 *   4. v1 item cards do not come across. Their owners are given free packs
 *      instead, one per `ITEMS_PER_FREE_PACK` items, rounded up - and each server's
 *      batch of free packs holds one Secret Art and one Legendary, in packs
 *      chosen at random and never the bot admin's.
 *
 * v1's own tables are only read. It refuses to run twice (`--force` overrides).
 */

pb.autoCancellation(false);

const commit = process.argv.includes("--commit");
const force = process.argv.includes("--force");

/** v1's colour attribute, which rode along as the converted cards' second tag. */
const COLOUR_TAGS = new Set(["red", "blue", "yellow", "purple", "green", "black", "light", "shadow", "item"]);
const TEST_COLLECTIONS = [V2_USER_CARD, "v2_deck", "v2_dungeon_run", "v2_battle"];
const ITEM_RARITIES = new Set(["i", "ri"]);

const say = (line = "") => console.log(line);

const run = async () => {
  say(commit ? "MIGRATING - this writes to the live database." : "Dry run - nothing is written. Add --commit to migrate.");
  say();

  const legacyDefinitions = new Map(
    (await pb.collection<CardDefinitionRecord>("card_definition").getFullList()).map((row) => [row.id!, row]),
  );
  const legacyCopies = await pb.collection<UserCardRecord>("user_card").getFullList();
  const definitions = await pb.collection<V2CardDefinitionRecord>(V2_CARD_DEFINITION).getFullList();
  const byLegacy = new Map(definitions.filter((row) => row.legacy_card).map((row) => [row.legacy_card, row]));

  /* --- already done? --- */
  const existing = await pb.collection<V2UserCardRecord>(V2_USER_CARD).getFullList({ fields: "id,acquired_from" });
  const converted = existing.filter((copy) => copy.acquired_from === "convert").length;
  // Absent until Pocketbase has been restarted onto the migration that adds it.
  const freePacks = await pb
    .collection(V2_FREE_PACK)
    .getList(1, 1)
    .then((page) => page.totalItems)
    .catch(() => {
      if (commit) throw new Error("v2_free_pack does not exist yet - restart the service first.");
      say("NOTE: the v2_free_pack table does not exist yet. Restart the service before --commit.\n");
      return 0;
    });
  if ((converted > 0 || freePacks > 0) && !force) {
    say(`This has already been run: ${converted} converted copies and ${freePacks} free packs exist.`);
    say("Nothing done. Use --force only if you know why you are running it again.");
    return;
  }

  /* --- 1. test data --- */
  say("1. Test data to wipe");
  for (const name of TEST_COLLECTIONS) {
    const rows = await pb.collection(name).getFullList({ fields: "id" });
    say(`   ${name.padEnd(16)} ${rows.length}`);
    if (commit) for (const row of rows) await pb.collection(name).delete(row.id);
  }
  say();

  /* --- 2. colour tags --- */
  const coloured = definitions.filter(
    (row) => row.legacy_card && (row.tags ?? []).some((tag, index) => index === 1 && COLOUR_TAGS.has(tag)),
  );
  say(`2. Converted cards with a colour tag to remove: ${coloured.length}`);
  if (commit) {
    for (const row of coloured) {
      await pb.collection(V2_CARD_DEFINITION).update(row.id!, {
        tags: (row.tags ?? []).filter((tag, index) => !(index === 1 && COLOUR_TAGS.has(tag))),
      });
    }
  }
  say();

  /* --- 3. battlers --- */
  say("3. v1 battlers to bring across");
  const missing = new Map<string, number>();
  const serials = new Map<string, number[]>();
  const perServer = new Map<string, { copies: number; players: Set<string>; over: number }>();
  const items = new Map<string, ItemOwner>();
  let made = 0;

  for (const copy of legacyCopies) {
    const legacy = legacyDefinitions.get(copy.card);
    if (!legacy) continue;

    if (ITEM_RARITIES.has(legacy.rarity)) {
      const key = `${copy.server_id}:${copy.user_id}`;
      const owner = items.get(key) ?? {
        userId: copy.user_id,
        serverId: copy.server_id,
        identifier: copy.identifier,
        items: 0,
      };
      owner.items += 1;
      items.set(key, owner);
      continue;
    }

    const definition = byLegacy.get(copy.card);
    if (!definition) {
      missing.set(legacy.card_name, (missing.get(legacy.card_name) ?? 0) + 1);
      continue;
    }

    const server = perServer.get(copy.server_id) ?? { copies: 0, players: new Set(), over: 0 };
    const taken = serials.get(`${copy.server_id}:${definition.id}`) ?? [];
    const serial = nextSerial(taken);
    taken.push(serial);
    serials.set(`${copy.server_id}:${definition.id}`, taken);
    if (definition.population > 0 && serial > definition.population) server.over += 1;
    server.copies += 1;
    server.players.add(copy.user_id);
    perServer.set(copy.server_id, server);

    if (commit) {
      await pb.collection<V2UserCardRecord>(V2_USER_CARD).create({
        user_id: copy.user_id,
        server_id: copy.server_id,
        identifier: copy.identifier,
        card: definition.id!,
        foil: LEGACY_FOIL_RARITIES.includes(legacy.rarity),
        // Rolled per copy: two players' copies of one card can differ.
        keyword: rollCopyKeyword(definition.rarity),
        legendary: "",
        serial,
        acquired_from: "convert",
      });
      made += 1;
    }
  }

  for (const [serverId, server] of perServer) {
    say(`   server …${serverId.slice(-4)}  ${server.copies} copies for ${server.players.size} players` +
      (server.over ? `  (${server.over} beyond their card's copy limit - kept anyway)` : ""));
  }
  if (missing.size > 0) {
    say(`   NOT brought across, no v2 card for them: ${[...missing].map(([name, count]) => `${name} ×${count}`).join(", ")}`);
  }
  if (commit) say(`   created ${made}`);
  say();

  /* --- 4. items become free packs --- */
  say(`4. Free packs for item cards (1 per ${ITEMS_PER_FREE_PACK}, rounded up)`);
  const plan = planFreePacks([...items.values()], { exclude: ADMIN_ID || undefined });
  for (const serverId of [...new Set(plan.packs.map((pack) => pack.serverId))]) {
    const batch = plan.packs.filter((pack) => pack.serverId === serverId);
    say(`   server …${serverId.slice(-4)}  ${batch.length} packs`);
    const owners = [...items.values()].filter((owner) => owner.serverId === serverId).sort((a, b) => b.items - a.items);
    for (const owner of owners) {
      const packs = batch.filter((pack) => pack.userId === owner.userId).length;
      say(`      ${owner.identifier.split("-")[0].padEnd(22)} ${String(owner.items).padStart(4)} items → ${packs} pack${packs === 1 ? "" : "s"}`);
    }
    // Which packs hold them is not printed: it is a surprise for the server,
    // the person running this included.
    for (const special of ["secret_art", "legendary"] as const) {
      const placed = batch.some((pack) => pack.special === special);
      say(`      ${special === "secret_art" ? "Secret Art" : "Legendary "} ${placed ? "placed in one pack" : "NOT placed - no eligible pack"}`);
    }
  }
  if (!ADMIN_ID) say("   WARNING: ADMIN_ID is not set, so no one's packs are excluded from the special pulls.");
  if (commit) {
    for (const pack of plan.packs) {
      await pb.collection(V2_FREE_PACK).create({
        user_id: pack.userId,
        server_id: pack.serverId,
        identifier: pack.identifier,
        special: pack.special,
        reason: "items",
        opened: false,
      });
    }
    say(`   created ${plan.packs.length}`);
  }
  say();

  const secretArts = definitions.filter((row) => row.secret_art && row.active).length;
  if (secretArts === 0) {
    say("NOTE: there is no active Secret Art in the pool. A pack holding one that finds none passes it to");
    say("      another unopened free pack, and it is lost if they run out first. Add one before launch.");
  }
  say(commit ? "Done." : "Dry run complete. Nothing was written.");
};

await run();
process.exit(0);
