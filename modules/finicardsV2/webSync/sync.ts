import sharp from "sharp";
import type {
  V2CardDefinitionRecord,
  V2DeckRecord,
  V2UserCardRecord,
} from "../../../types/PocketbaseTablesV2";
import { pb } from "../../../utilities/pocketbase";
import { loadArt, renderCardImage, resolveArtSource } from "../cardArt/generateCardImage";
import { LEGENDARY_GIF_EFFECTS, legendaryGif } from "../cardArt/legendaryGif";
import { toBattleCard, V2_CARD_DEFINITION, V2_USER_CARD } from "../cardStore";
import {
  DECK_SIZE,
  MAX_DECK_NAME_LENGTH,
  MAX_DECKS_PER_USER,
  V2_DECK,
} from "../decks";
import { GRADE_LABEL, KEYWORDS } from "../keywords";
import { RULES, TYPE_BEATS } from "../rules";
import { remote, signIn } from "./remote";
import {
  artKeyOf,
  buildSnapshot,
  faceKeyOf,
  fingerprint,
  payloadOf,
  planSync,
  type LocalState,
  type WebCollection,
  type WebRow,
} from "./snapshot";

/**
 * Keeps the web mailbox matching Fini's database.
 *
 * Fini remembers what the mailbox holds as one fingerprint per row, read from
 * the mailbox itself when the bot starts. After that a pass reads only Fini's
 * own database - which is local and cheap - and sends the difference, so a
 * pass with nothing to say costs the mailbox nothing.
 */

/** Longest side of the artwork sent for a card, in pixels. */
const ART_SIZE = 800;
/** Rows sent side by side. */
const PARALLEL = 6;
/**
 * Card faces rendered in one pass, and how many at a time. Rendering is the
 * same work as showing a card in Discord, so a first send of thousands is
 * spread over many passes rather than taking the bot's attention all at once.
 */
const FACES_PER_PASS = 150;
const FACES_PARALLEL = 2;

/** Written before what points at it; removed after. */
const WRITE_ORDER: WebCollection[] = [
  "web_meta",
  "web_definition",
  "web_card",
  "web_deck",
  "web_player",
];

/** What the mailbox holds, as Fini last knew it. Null until first read. */
let held: Record<WebCollection, Map<string, string>> | null = null;
/** The artwork each card in the mailbox was made from. */
const heldArt = new Map<string, string>();
/** What each copy's card face in the mailbox was rendered from. */
const heldFace = new Map<string, string>();

/** Forgets what the mailbox holds, so the next pass reads it afresh. */
export const forgetMailbox = (): void => {
  held = null;
  heldArt.clear();
  heldFace.clear();
};

const readMailbox = async (): Promise<Record<WebCollection, Map<string, string>>> => {
  const state = {} as Record<WebCollection, Map<string, string>>;
  for (const collection of WRITE_ORDER) {
    const rows = await remote.collection(collection).getFullList({ batch: 500 });
    state[collection] = new Map(rows.map((row) => [row.id, fingerprint(collection, row)]));
    if (collection === "web_definition") {
      for (const row of rows) heldArt.set(row.id, (row.art_key as string) ?? "");
    }
    if (collection === "web_card") {
      for (const row of rows) heldFace.set(row.id, (row.face_key as string) ?? "");
    }
  }
  return state;
};

/** What the site is told about the game, so it never keeps rules of its own. */
export const buildMeta = (): Record<string, unknown> => ({
  limits: {
    deckSize: DECK_SIZE,
    maxDecks: MAX_DECKS_PER_USER,
    maxDeckName: MAX_DECK_NAME_LENGTH,
  },
  rules: { statTotal: RULES.statTotal, typeBeats: TYPE_BEATS },
  keywords: Object.fromEntries(
    KEYWORDS.map((keyword) => [
      keyword.slug,
      {
        name: keyword.name,
        grade: GRADE_LABEL[keyword.grade],
        description: keyword.description,
      },
    ]),
  ),
  legendary: LEGENDARY_GIF_EFFECTS,
});

const readLocal = async (serverNames: Record<string, string>): Promise<LocalState> => {
  const [definitions, cards, decks] = await Promise.all([
    pb
      .collection<V2CardDefinitionRecord>(V2_CARD_DEFINITION)
      .getFullList({ batch: 500, requestKey: null }),
    pb.collection<V2UserCardRecord>(V2_USER_CARD).getFullList({ batch: 500, requestKey: null }),
    pb.collection<V2DeckRecord>(V2_DECK).getFullList({ batch: 500, requestKey: null }),
  ]);
  return { definitions, cards, decks, serverNames, meta: buildMeta() };
};

/** Runs `work` over `items`, a few at a time. Failures are counted, not thrown. */
const inParallel = async <T>(
  items: T[],
  work: (item: T) => Promise<void>,
  lanes: number = PARALLEL,
): Promise<number> => {
  let failed = 0;
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await work(item);
      } catch (error) {
        failed += 1;
        if (failed <= 3) console.error("Web sync: a row was not sent:", error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, lane));
  return failed;
};

/**
 * A card's artwork for the site: the whole picture, bars trimmed, small
 * enough to load quickly. The site does its own cropping around the focus.
 */
const webArt = async (definition: V2CardDefinitionRecord): Promise<Buffer | null> => {
  const source = definition.art
    ? { url: pb.files.getURL(definition, definition.art), adjust: definition.art_adjust ?? null }
    : await resolveArtSource(definition);
  const picture = await loadArt(source);
  if (!picture) return null;
  return sharp(picture)
    .resize({ width: ART_SIZE, height: ART_SIZE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
};

/** Sends a card's artwork if the mailbox's copy was made from something else. */
const sendArt = async (definition: V2CardDefinitionRecord): Promise<boolean> => {
  const id = definition.id ?? "";
  const key = artKeyOf(definition);
  if (heldArt.get(id) === key) return false;

  const art = key ? await webArt(definition).catch(() => null) : null;
  if (key && !art) {
    // Could not be had just now. Say nothing, and try again after a restart.
    heldArt.set(id, key);
    return false;
  }
  await remote.collection("web_definition").update(id, {
    art_key: key,
    art: art ? new File([art], `${id}.webp`, { type: "image/webp" }) : null,
  });
  heldArt.set(id, key);
  return true;
};

/**
 * Renders a copy's card face - the picture Discord shows - and sends it.
 * A Legendary is sent with its animation too, for the site to play.
 */
const sendFace = async (
  card: V2UserCardRecord,
  definition: V2CardDefinitionRecord,
  key: string,
): Promise<boolean> => {
  const id = card.id ?? "";
  const battleCard = toBattleCard({ ...card, definition });
  const png = await renderCardImage(battleCard);
  // Could not be drawn just now. Say nothing, and try again after a restart.
  heldFace.set(id, key);
  if (!png) return false;

  const face = await sharp(png).webp({ quality: 80 }).toBuffer();
  const animation = card.legendary ? await legendaryGif(battleCard) : null;
  await remote.collection("web_card").update(id, {
    face_key: key,
    face: new File([face], `${id}.webp`, { type: "image/webp" }),
    animation: animation ? new File([animation], `${id}.gif`, { type: "image/gif" }) : null,
  });
  return true;
};

export type SyncSummary = {
  created: number;
  updated: number;
  removed: number;
  art: number;
  faces: number;
  /** Card faces still to be rendered, on later passes. */
  facesLeft: number;
  failed: number;
};

export const summaryLine = (summary: SyncSummary): string =>
  `${summary.created} new, ${summary.updated} changed, ${summary.removed} removed, ${summary.art} artworks, ${summary.faces} faces` +
  (summary.facesLeft ? ` (${summary.facesLeft} to go)` : "") +
  (summary.failed ? `, ${summary.failed} failed` : "");

/** One pass: read Fini's database, send what the mailbox lacks. */
export const syncOnce = async (serverNames: Record<string, string>): Promise<SyncSummary> => {
  await signIn();
  if (!held) held = await readMailbox();
  const mailbox = held;

  const local = await readLocal(serverNames);
  const snapshot = buildSnapshot(local);
  const summary: SyncSummary = {
    created: 0,
    updated: 0,
    removed: 0,
    art: 0,
    faces: 0,
    facesLeft: 0,
    failed: 0,
  };

  const plans = Object.fromEntries(
    WRITE_ORDER.map((collection) => [
      collection,
      planSync(collection, snapshot[collection], mailbox[collection]),
    ]),
  ) as Record<WebCollection, ReturnType<typeof planSync>>;

  const remember = (collection: WebCollection, row: WebRow) =>
    mailbox[collection].set(row.id, fingerprint(collection, row));

  for (const collection of WRITE_ORDER) {
    const plan = plans[collection];
    summary.failed += await inParallel(plan.create, async (row) => {
      await remote.collection(collection).create({ id: row.id, ...payloadOf(collection, row) });
      remember(collection, row);
      summary.created += 1;
    });
    summary.failed += await inParallel(plan.update, async (row) => {
      await remote.collection(collection).update(row.id, payloadOf(collection, row));
      remember(collection, row);
      summary.updated += 1;
    });
  }

  const wanted = local.definitions.filter((definition) =>
    mailbox.web_definition.has(definition.id ?? ""),
  );
  summary.failed += await inParallel(wanted, async (definition) => {
    if (await sendArt(definition)) summary.art += 1;
  });

  const definitions = new Map(local.definitions.map((definition) => [definition.id ?? "", definition]));
  const faceless = local.cards.flatMap((card) => {
    const definition = definitions.get(card.card);
    if (!definition || !mailbox.web_card.has(card.id ?? "")) return [];
    const key = faceKeyOf(card, definition);
    return heldFace.get(card.id ?? "") === key ? [] : [{ card, definition, key }];
  });
  summary.facesLeft = Math.max(faceless.length - FACES_PER_PASS, 0);
  summary.failed += await inParallel(
    faceless.slice(0, FACES_PER_PASS),
    async ({ card, definition, key }) => {
      if (await sendFace(card, definition, key)) summary.faces += 1;
    },
    FACES_PARALLEL,
  );

  // Copies before the cards they are copies of.
  for (const collection of [...WRITE_ORDER].reverse()) {
    summary.failed += await inParallel(plans[collection].remove, async (id) => {
      try {
        await remote.collection(collection).delete(id);
      } catch (error) {
        // Already gone - removed along with the card it pointed at.
        if ((error as { status?: number })?.status !== 404) throw error;
      }
      mailbox[collection].delete(id);
      if (collection === "web_definition") heldArt.delete(id);
      if (collection === "web_card") heldFace.delete(id);
      summary.removed += 1;
    });
  }

  return summary;
};
