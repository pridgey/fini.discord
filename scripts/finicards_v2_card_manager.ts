import { appendFile, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import {
  CARD_WIDTH,
  loadArt,
  renderCardImage,
  resolveArtSource,
} from "../modules/finicards/cardArt/generateCardImage";
import { renderDungeonScene } from "../modules/finicards/cardArt/dungeonScene";
import { renderHandStrip } from "../modules/finicards/cardArt/handStrip";
import { layoutFor } from "../modules/finicards/cardArt/layouts";
import { renumberSets, toBattleCard } from "../modules/finicards/cardStore";
import { SPIKE_GAMMA } from "../modules/finicards/convertLegacyCards";
import { RARITY_COST, RULES } from "../modules/finicards/rules";
import { deriveType, normalizeSpread, validateSpread } from "../modules/finicards/statBudget";
import type { BattleCard } from "../modules/finicards/types";
import type {
  ArtAdjust,
  CardRarity,
  V2CardDefinitionRecord,
  V2UserCardRecord,
} from "../types/PocketbaseTablesV2";
import { pb } from "../utilities/pocketbase";

/**
 * The card manager: a local web page for looking after the v2 card pool.
 *
 * Served under `/cards/` by the art check's `--serve`. It shows the whole
 * catalogue, opens any card to correct it, starts a new rarity of an existing
 * character, or a card from nothing, and finds artwork for all of them.
 *
 * Unlike the review pages it writes to the pool - but only when Save or
 * Delete is pressed. Everything up to that point (typing in a field, trying a
 * candidate image, marking a subject) is a preview rendered from the unsaved
 * state. Each write is appended to `edits.jsonl` with what the card was
 * before, so a mistake can be read back and undone by hand.
 *
 * A card never gets a keyword here: those are rolled per copy when pulled.
 */

const DATA = path.join(import.meta.dir, "test_images", "card-manager");
const CANDIDATES = path.join(DATA, "candidates");
const THUMBS = path.join(DATA, "thumbs");
const WIKIS_FILE = path.join(DATA, "wikis.json");
const EDITS_FILE = path.join(DATA, "edits.jsonl");
const PAGE_FILE = path.join(import.meta.dir, "finicards_v2_card_manager.html");
/** Where the picker this replaced kept its candidates. */
const OLD_PICKER = path.join(import.meta.dir, "test_images", "art-candidates");

const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) finicards-card-manager/1.0";
/**
 * Danbooru asks for an honest client name and turns away anything that claims
 * to be a browser without being one.
 */
const agentFor = (url: string | URL): string =>
  /(^|\.)donmai\.us$/.test(new URL(url).hostname) ? "finicards-card-manager/1.0" : USER_AGENT;
/** Largest image accepted as a candidate. */
const MAX_BYTES = 40 * 1024 * 1024;
/** Candidates are stored no larger than this on their long side. */
const MAX_SIDE = 2400;

const RARITIES: CardRarity[] = ["common", "uncommon", "full_art"];
/**
 * Copies allowed per server for a new card, by rarity. 0 is no limit: cards are
 * unlimited since 2026-10-16, so that every set can be completed. A card can
 * still be given a limit of its own.
 */
const POPULATION: Record<CardRarity, number> = { common: 0, uncommon: 0, full_art: 0 };
/**
 * What the page calls a rarity. A Secret Art is a full-art with a flag on it,
 * but to someone making cards it is a fourth kind, so the page is given one
 * and it is turned back into rarity-and-flag here.
 */
type Kind = CardRarity | "secret_art";
const SECRET_ART_POPULATION = 0;
const rarityOf = (kind: unknown): CardRarity =>
  kind === "secret_art" ? "full_art" : RARITIES.includes(kind as CardRarity) ? (kind as CardRarity) : "common";
const kindOf = (row: { rarity: CardRarity; secret_art?: boolean }): Kind =>
  row.secret_art ? "secret_art" : row.rarity;
/** The set a card made here goes into unless told otherwise. */
const DEFAULT_SET = 4;
/** v1's colour attribute, which rode along as a tag and is not wanted on new cards. */
const COLOUR_TAGS = new Set(["red", "blue", "yellow", "purple", "green", "black", "light", "shadow", "item"]);

const SAFE_KEY = /^[a-z0-9][a-z0-9_-]{0,80}$/i;
const SAFE_FILE = /^[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp)$/i;

// The page asks for a card's four previews and its artwork at once, and each
// of those reads the same record. Pocketbase's client cancels a request when
// an identical one starts, which is right for a search box and wrong here:
// most of the previews came back cancelled.
pb.autoCancellation(false);

const collection = () => pb.collection<V2CardDefinitionRecord>("v2_card_definition");

const json = (value: unknown, status = 200) => Response.json(value, { status });
const fail = (message: string, status = 400) => json({ error: message }, status);

const readJson = async <T>(file: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse((await readFile(file)).toString()) as T;
  } catch {
    return fallback;
  }
};

const slug = (value: string): string =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/* ------------------------------------------------------------ candidates --- */

/** A card's candidate folder. `key` is its id, or a temporary one before it is saved. */
const folderOf = (key: string): string | null =>
  SAFE_KEY.test(key) ? path.join(CANDIDATES, key) : null;

const candidatePath = (key: string, file: string): string | null => {
  const folder = folderOf(key);
  return folder && SAFE_FILE.test(file) ? path.join(folder, file) : null;
};

const listCandidates = async (key: string) => {
  const folder = folderOf(key);
  if (!folder) return [];
  let files: string[] = [];
  try {
    files = (await readdir(folder)).filter((name) => SAFE_FILE.test(name)).sort();
  } catch {
    return [];
  }
  const sources = await readJson<Record<string, string>>(path.join(folder, "sources.json"), {});
  const artists = await candidateArtists(folder, files, sources);
  return Promise.all(
    files.map(async (file) => {
      const meta = await sharp(path.join(folder, file)).metadata();
      return {
        file,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        source: sources[file] ?? "",
        artist: artists[file] ?? "",
      };
    }),
  );
};

/**
 * Who drew the image at a link, where the link says: a Danbooru file is named
 * by its hash, which finds its post, and a Magic crop by its card's id.
 */
const artistFromSource = async (source: string): Promise<string | null> => {
  try {
    const url = new URL(source);
    const lookup = async (address: string): Promise<any> => {
      const response = await fetch(address, {
        headers: { "User-Agent": agentFor(address), Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });
      // "No such post" is an answer; anything else is the site being busy.
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${response.status}`);
      return response.json();
    };

    if (url.hostname === "cdn.donmai.us") {
      const md5 = url.pathname.match(/([0-9a-f]{32})\.\w+$/)?.[1];
      const post = md5 ? (await lookup(`https://danbooru.donmai.us/posts.json?md5=${md5}`)) : null;
      return danbooruArtist((Array.isArray(post) ? post[0] : post)?.tag_string_artist);
    }
    if (url.hostname === "cards.scryfall.io") {
      const id = url.pathname.match(/([0-9a-f-]{36})\.\w+$/)?.[1];
      const card = id ? await lookup(`https://api.scryfall.com/cards/${id}`) : null;
      const back = url.pathname.includes("/back/");
      return String(card?.card_faces?.[back ? 1 : 0]?.artist ?? card?.artist ?? "");
    }
  } catch {
    // The lookup failed, which says nothing about the image: ask again later.
    return null;
  }
  return "";
};

/** Danbooru's artist tags as a credit: "devin_elle_kurtz" is "devin elle kurtz". */
const danbooruArtist = (tags: unknown): string =>
  String(tags ?? "")
    .split(" ")
    .filter((tag) => tag && !/^(banned_artist|artist_request|tagme)$/.test(tag))
    .map((tag) => tag.replace(/_\(.*\)$/, "").replace(/_/g, " "))
    .join(", ");

/**
 * Each candidate's artist, kept beside the images. One added before artists
 * were recorded is looked up from its link the first time it is listed.
 */
const candidateArtists = async (
  folder: string,
  files: string[],
  sources: Record<string, string>,
): Promise<Record<string, string>> => {
  const artistsFile = path.join(folder, "artists.json");
  const artists = await readJson<Record<string, string>>(artistsFile, {});
  const missing = files.filter((file) => artists[file] === undefined && sources[file]);
  if (missing.length === 0) return artists;

  // One at a time: a folder of thirty images asked for at once gets refused.
  for (const file of missing) {
    const artist = await artistFromSource(sources[file]);
    if (artist !== null) artists[file] = artist;
  }
  await writeFile(artistsFile, JSON.stringify(artists, null, 2));
  return artists;
};

/** Stores image bytes as one of a card's candidates and returns its file name. */
const storeCandidate = async (key: string, bytes: Buffer, source: string, artist = ""): Promise<string> => {
  const folder = folderOf(key);
  if (!folder) throw new Error("Bad card key");
  if (bytes.length > MAX_BYTES) throw new Error("Image is too large");

  // Re-encoded rather than saved as sent: it bounds the size, and it means
  // only something sharp can read as an image ever lands in the folder.
  const meta = await sharp(bytes).metadata();
  const sized = sharp(bytes).resize({
    width: MAX_SIDE,
    height: MAX_SIDE,
    fit: "inside",
    withoutEnlargement: true,
  });
  const name = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, "0")}.${meta.hasAlpha ? "png" : "jpg"}`;
  await mkdir(folder, { recursive: true });
  await writeFile(
    path.join(folder, name),
    await (meta.hasAlpha ? sized.png() : sized.jpeg({ quality: 92 })).toBuffer(),
  );

  if (source) {
    const sourcesFile = path.join(folder, "sources.json");
    const sources = await readJson<Record<string, string>>(sourcesFile, {});
    sources[name] = source;
    await writeFile(sourcesFile, JSON.stringify(sources, null, 2));
  }
  if (artist) {
    const artistsFile = path.join(folder, "artists.json");
    const artists = await readJson<Record<string, string>>(artistsFile, {});
    artists[name] = artist;
    await writeFile(artistsFile, JSON.stringify(artists, null, 2));
  }
  return name;
};

const downloadCandidate = async (key: string, url: string, artist = ""): Promise<string> => {
  const target = new URL(url);
  if (target.protocol !== "https:") throw new Error("Only https image links");

  const response = await fetch(target, {
    headers: { "User-Agent": agentFor(target) },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  if (!(response.headers.get("content-type") ?? "").startsWith("image/")) {
    throw new Error("That link is not an image");
  }
  return storeCandidate(key, Buffer.from(await response.arrayBuffer()), url, artist);
};

/* ------------------------------------------------------------------ wikis --- */

const wikiApis = new Map<string, string | null>();

/** The MediaWiki API of a wiki, which lives at one of two paths. */
const wikiApi = async (domain: string): Promise<string | null> => {
  if (wikiApis.has(domain)) return wikiApis.get(domain) ?? null;

  for (const candidate of [`https://${domain}/api.php`, `https://${domain}/w/api.php`]) {
    try {
      const response = await fetch(`${candidate}?action=query&meta=siteinfo&format=json`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok && (await response.json())?.query?.general) {
        wikiApis.set(domain, candidate);
        return candidate;
      }
    } catch {
      // Not there; try the other path.
    }
  }
  wikiApis.set(domain, null);
  return null;
};

type SearchHit = {
  title: string;
  url: string;
  thumb: string;
  width: number;
  height: number;
  /** Who drew it, where the source says. */
  artist?: string;
};

/**
 * Images on a wiki matching `query`: files whose name or description match,
 * plus every image on the page of that exact title, largest first.
 */
const searchWiki = async (domain: string, query: string): Promise<SearchHit[]> => {
  const api = await wikiApi(domain);
  if (!api) throw new Error(`No MediaWiki API found at ${domain}`);

  const hits = new Map<string, SearchHit>();
  const collect = async (params: Record<string, string>, rounds: number) => {
    let more: Record<string, string> = {};
    for (let round = 0; round < rounds; round++) {
      const response = await fetch(
        `${api}?${new URLSearchParams({
          action: "query",
          format: "json",
          prop: "imageinfo",
          iiprop: "url|size|mime",
          iiurlwidth: "360",
          redirects: "1",
          ...params,
          ...more,
        })}`,
        { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60000) },
      );
      const body = await response.json();
      for (const page of Object.values<any>(body?.query?.pages ?? {})) {
        const info = page.imageinfo?.[0];
        if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime ?? "")) continue;
        // Anything smaller cannot fill a card frame.
        if (info.width < 700 || info.height < 500) continue;
        hits.set(info.url, {
          title: String(page.title).replace(/^File:/, ""),
          url: info.url,
          thumb: info.thumburl ?? info.url,
          width: info.width,
          height: info.height,
        });
      }
      if (!body.continue) break;
      more = body.continue;
    }
  };

  await collect({ generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "50" }, 2);
  // In modest pages: a wiki asked to thumbnail 500 files at once times out.
  await collect({ generator: "images", titles: query, gimlimit: "120" }, 5);

  return [...hits.values()].sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 120);
};

type WikiGuess = { domain: string; name: string; why: string };

/** Fandom's own search over its communities - by a wiki's name and description. */
const fandomCommunities = async (query: string): Promise<{ domain: string; name: string; pages: number }[]> => {
  try {
    const response = await fetch(
      `https://services.fandom.com/unified-search/community-search?${new URLSearchParams({ query, lang: "en", limit: "6" })}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) return [];
    const body = await response.json();
    return (body.results ?? []).map((result: any) => ({
      domain: new URL(result.url).hostname,
      name: String(result.name ?? ""),
      pages: Number(result.pageCount ?? 0),
    }));
  } catch {
    return [];
  }
};

/** Whether a wiki has an article that looks to be about `name`. */
const wikiKnows = async (domain: string, name: string): Promise<boolean> => {
  const api = await wikiApi(domain);
  if (!api) return false;
  try {
    const response = await fetch(
      `${api}?${new URLSearchParams({ action: "query", format: "json", list: "search", srsearch: name, srlimit: "3" })}`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12000) },
    );
    const wanted = name.toLowerCase().split(/\s+/)[0];
    const results: any[] = (await response.json())?.query?.search ?? [];
    return results.some((result) => String(result.title).toLowerCase().includes(wanted));
  } catch {
    return false;
  }
};

/**
 * The wikis most likely to hold pictures of a character: the one used before
 * for the series, then Fandom's matches for the series and for the name, kept
 * only if they have an article on the character, real wikis before fan ones.
 */
const guessWikis = async (name: string, series: string): Promise<WikiGuess[]> => {
  const remembered = (await readJson<Record<string, string>>(WIKIS_FILE, {}))[series];
  // A series is often filed under a shorter name than the card gives it:
  // "Mario Bros." lives on the Mario wiki. So its first word is tried too.
  const firstWord = series.split(/[^A-Za-z0-9']+/).find((word) => word.length > 2) ?? "";
  const [bySeries, byFirstWord, byName] = await Promise.all([
    series ? fandomCommunities(series) : Promise.resolve([]),
    firstWord && firstWord.toLowerCase() !== series.toLowerCase()
      ? fandomCommunities(firstWord)
      : Promise.resolve([]),
    fandomCommunities(name),
  ]);

  const found = new Map<string, WikiGuess & { score: number }>();
  const fanMade = /fanon|fan ?fic|fan made|parod|role ?play|\brp\b|fandub|oc\b|crossover/i;
  const consider = (
    list: { domain: string; name: string; pages: number }[],
    why: string,
    weight: number,
  ) =>
    list.forEach((wiki, index) => {
      if (found.has(wiki.domain)) return;
      found.set(wiki.domain, {
        domain: wiki.domain,
        name: wiki.name,
        why,
        // Earlier in Fandom's own ranking, larger, and not fan-made, is better.
        // Size counts for a lot: the real wiki for a series dwarfs its imitators.
        score:
          weight - index * 3 + Math.min(wiki.pages, 40000) / 2000 - (fanMade.test(wiki.name) ? 30 : 0),
      });
    });
  consider(bySeries, `matches the series "${series}"`, 20);
  consider(byFirstWord, `matches "${firstWord}"`, 14);
  consider(byName, `matches "${name}"`, 12);

  const ranked = [...found.values()].sort((a, b) => b.score - a.score).slice(0, 8);
  const knows = await Promise.all(ranked.map((wiki) => wikiKnows(wiki.domain, name)));
  const guesses: WikiGuess[] = ranked
    .filter((_, index) => knows[index])
    .slice(0, 3)
    .map(({ domain, name: wikiName, why }) => ({ domain, name: wikiName, why }));

  if (remembered && !guesses.some((guess) => guess.domain === remembered)) {
    guesses.unshift({ domain: remembered, name: remembered, why: `used before for ${series}` });
  }
  return guesses.slice(0, 3);
};

/* ------------------------------------------------------- credited sources --- */

// Wikis are mostly screenshots. These two are where drawn art with a named
// artist lives, and neither carries generated images: Danbooru bans them, and
// Wizards of the Coast requires human-made art on its cards.

type HitGroup = { label: string; note: string; hits: SearchHit[] };

const DANBOORU = "https://danbooru.donmai.us";
/**
 * Nothing posted before this can have come out of an image generator, which
 * only became usable in the second half of 2022. Danbooru's ban is the first
 * guarantee; this is the second.
 */
const BEFORE_GENERATORS = "2022-08-01";
/** Titles and fillers that are not what a character is filed under. */
const NAME_FILLER = new Set(["the", "of", "and", "mr", "mrs", "ms", "dr", "uncle", "aunt", "baby", "king", "queen", "princess", "prince"]);

const fetchJson = async (url: string): Promise<any> => {
  const response = await fetch(url, {
    headers: { "User-Agent": agentFor(url), Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  // Both of these answer "nothing found" with a 404 and a body saying so.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
  return response.json();
};

/**
 * The character tags a name is most likely filed under. Danbooru writes names
 * family-name first, romanises long vowels its own way ("gotoh_hitori"), and
 * tells namesakes apart with the series in brackets, so several spellings are
 * tried and the best two kept for the reviewer to judge between.
 */
const danbooruTags = async (name: string, series: string): Promise<{ name: string; posts: number }[]> => {
  const words = slug(name).split("_").filter(Boolean);
  if (words.length === 0) return [];
  const full = words.join("_");
  const reversed = [...words].reverse().join("_");
  const telling = words.filter((word) => word.length >= 3 && !NAME_FILLER.has(word));
  const seriesWords = slug(series).split("_").filter((word) => word.length >= 4);

  // As written, for the names it keeps punctuation in: "koro-sensei", "mr._popo".
  const literal = name.toLowerCase().trim().replace(/\s+/g, "_");

  const patterns = new Set<string>([full, reversed, literal, `${full}_(*`, `${reversed}_(*`, `${literal}_(*`]);
  for (const word of telling) {
    patterns.add(word);
    patterns.add(`${word}_(*`);
  }
  if (words.length === 2) {
    patterns.add(`${words[1]}*_${words[0]}*`);
    patterns.add(`${words[0]}*_${words[1]}*`);
  }

  const found = new Map<string, number>();
  await Promise.all(
    [...patterns].map(async (pattern) => {
      const tags = await fetchJson(
        `${DANBOORU}/tags.json?${new URLSearchParams({
          "search[name_or_alias_matches]": pattern,
          "search[category]": "4",
          "search[order]": "count",
          limit: "6",
        })}`,
      ).catch(() => null);
      for (const tag of tags ?? []) if (tag.post_count > 0) found.set(tag.name, tag.post_count);
    }),
  );

  const score = (tag: string, posts: number) => {
    const [base, qualifier = ""] = tag.replace(/\)$/, "").split("_(");
    let points = 0;
    if (base === full || base === reversed || base === literal) points = 100;
    else if (words.length === 2 && base.includes(words[0].slice(0, 3)) && base.includes(words[1].slice(0, 3))) points = 80;
    else if (telling.includes(base)) points = 50;
    if (qualifier && seriesWords.some((word) => qualifier.includes(word))) points += 30;
    // One word of the name under some other series' brackets is a namesake
    // more often than not: "sensei_(blue_archive)" is not Koro-sensei.
    else if (qualifier) points -= points >= 80 ? 10 : 25;
    return points + Math.log10(posts + 1);
  };

  const ranked = [...found]
    .map(([tag, posts]) => ({ name: tag, posts, points: score(tag, posts) }))
    // A costume or variant of a tag already found adds nothing: its posts
    // carry the plain tag too.
    .filter((tag) => !(tag.name.includes("_(") && found.has(tag.name.split("_(")[0])))
    .sort((a, b) => b.points - a.points);
  // A second tag only when it is nearly as likely as the first, which is when
  // the reviewer has a real choice to make rather than a namesake to skip.
  const sure = ranked.filter((tag) => tag.points >= 40 && tag.points >= ranked[0].points - 15).slice(0, 2);
  // With nothing certain, the likeliest namesake is still worth one look.
  return (sure.length > 0 ? sure : ranked.filter((tag) => tag.points >= 25).slice(0, 1)).map(
    ({ name: tag, posts }) => ({ name: tag, posts }),
  );
};

/** The best-scored safe posts under `tags`, from before image generators or since. */
const danbooruPosts = async (tags: string, era: "before" | "since", safe: boolean): Promise<SearchHit[]> => {
  const posts = await fetchJson(
    `${DANBOORU}/posts.json?${new URLSearchParams({
      tags: `${tags} date:${era === "before" ? "<" : ">="}${BEFORE_GENERATORS}${safe ? " rating:g,s" : ""} order:score`,
      limit: "200",
    })}`,
  );
  const hits: SearchHit[] = [];
  for (const post of posts ?? []) {
    if (!post.file_url || !/^(jpe?g|png|webp)$/.test(post.file_ext ?? "")) continue;
    if (post.image_width < 700 || post.image_height < 500) continue;
    // Banned outright, but belt and braces - and "assisted" is allowed there.
    if (/\bai-(generated|assisted)\b/.test(post.tag_string ?? "")) continue;
    const artist = danbooruArtist(post.tag_string_artist);
    const variants: any[] = post.media_asset?.variants ?? [];
    hits.push({
      title: `${artist || "unknown artist"} · ${String(post.created_at).slice(0, 4)}`,
      url: post.file_url,
      // Through this server: Danbooru's image host turns a browser away when
      // the picture is embedded in another site's page.
      thumb: `/cards/remote-thumb?url=${encodeURIComponent(
        variants.find((variant) => variant.type === "360x360")?.url ?? post.preview_file_url ?? post.file_url,
      )}`,
      width: post.image_width,
      height: post.image_height,
      artist,
    });
  }
  return hits;
};

const searchDanbooru = async (name: string, series: string, raw: string, safe: boolean): Promise<HitGroup[]> => {
  const rated = safe ? "safe only" : "every rating";
  const tags = raw ? [raw] : (await danbooruTags(name, series)).map((tag) => tag.name);
  const cutoff = BEFORE_GENERATORS.slice(0, 7);

  const groups = await Promise.all(
    tags.map(async (tag): Promise<HitGroup[]> => {
      const before = await danbooruPosts(tag, "before", safe);
      const found: HitGroup[] = [
        { label: `Danbooru — ${tag}`, note: `posted before ${cutoff}, so certainly not generated · ${rated}, best first`, hits: before },
      ];
      // A character who arrived after the cut-off has nothing before it, and
      // the site's ban still stands for what came later.
      if (before.length < 30) {
        const since = await danbooruPosts(tag, "since", safe);
        if (since.length > 0) {
          found.push({
            label: `Danbooru — ${tag}, newer`,
            note: `posted since ${cutoff}: covered by Danbooru's ban on AI art, not by the date · ${rated}`,
            hits: since,
          });
        }
      }
      return found;
    }),
  );
  return groups.flat();
};

/** Card illustrations from Magic: The Gathering, cropped to the art alone. */
const searchScryfall = async (name: string, raw: string): Promise<HitGroup[]> => {
  const find = async (query: string): Promise<any[]> =>
    (await fetchJson(`https://api.scryfall.com/cards/search?${new URLSearchParams({ q: query, unique: "art" })}`))?.data ?? [];

  let query = raw || `"${name}"`;
  let cards = await find(query);
  if (!raw && cards.length < 4) {
    // "Uncle Iroh" is one card; "Iroh" is eight.
    const word = slug(name)
      .split("_")
      .filter((part) => part.length >= 4 && !NAME_FILLER.has(part))
      .sort((a, b) => b.length - a.length)[0];
    if (word && word !== slug(name)) {
      const wider = await find(word);
      if (wider.length > cards.length) [query, cards] = [word, wider];
    }
  }

  const hits = await Promise.all(
    cards.slice(0, 40).flatMap((card) =>
      (card.image_uris ? [card] : (card.card_faces ?? [])).map(async (face: any): Promise<SearchHit | null> => {
        const url = face.image_uris?.art_crop;
        if (!url) return null;
        // Crops are near 626x457 but not exactly; ask rather than assume.
        let size = { width: 626, height: 457 };
        try {
          const image = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20000) });
          const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
          size = { width: meta.width ?? size.width, height: meta.height ?? size.height };
        } catch {
          // The nominal size will do.
        }
        const artist = String(face.artist ?? card.artist ?? "");
        return { title: `${face.name ?? card.name} · ${artist} · ${card.set_name}`, url, thumb: url, ...size, artist };
      }),
    ),
  );
  return [
    {
      label: `Magic: The Gathering — ${query}`,
      note: "official card art, landscape",
      hits: hits.filter((hit): hit is SearchHit => !!hit),
    },
  ];
};

/* ------------------------------------------------------------------ cards --- */

type Fields = {
  card_name: string;
  series: string;
  rarity: CardRarity;
  secret_art: boolean;
  power: number;
  wit: number;
  heart: number;
  tags: string[];
  set: number;
  population: number;
  active: boolean;
  flavour: string;
  artist: string;
};

/** What the page sends to describe a card as it stands in the editor, unsaved. */
type EditorState = {
  /** The card being edited, or absent for one not saved yet. */
  id?: string;
  /** Its candidate folder: the id, or a temporary key before it has one. */
  key: string;
  fields: Fields;
  /** A candidate chosen as the new art, or absent to keep what it has. */
  candidate?: string;
  adjust?: ArtAdjust | null;
};

const cleanFields = (raw: any): Fields => ({
  card_name: String(raw?.card_name ?? "").trim(),
  series: String(raw?.series ?? "").trim(),
  rarity: rarityOf(raw?.rarity),
  secret_art: raw?.rarity === "secret_art",
  power: Math.round(Number(raw?.power) || 0),
  wit: Math.round(Number(raw?.wit) || 0),
  heart: Math.round(Number(raw?.heart) || 0),
  tags: (Array.isArray(raw?.tags) ? raw.tags : [])
    .map((tag: unknown) => slug(String(tag)))
    .filter(Boolean)
    .slice(0, 12),
  set: Math.max(0, Math.round(Number(raw?.set) || 0)),
  population: Math.max(0, Math.round(Number(raw?.population) || 0)),
  active: !!raw?.active,
  flavour: String(raw?.flavour ?? "").trim(),
  artist: String(raw?.artist ?? "").trim(),
});

const cleanAdjust = (raw: any): ArtAdjust | null => {
  if (!raw || typeof raw !== "object") return null;
  const adjust: ArtAdjust = {};
  const share = (value: unknown) => Math.min(Math.max(Number(value) || 0, 0), 1);
  if (raw.focus && Number.isFinite(Number(raw.focus.x)) && Number.isFinite(Number(raw.focus.y))) {
    adjust.focus = { x: share(raw.focus.x), y: share(raw.focus.y) };
  }
  if (raw.trim) {
    adjust.trim = {
      left: Math.min(share(raw.trim.left), 0.45),
      top: Math.min(share(raw.trim.top), 0.45),
      right: Math.min(share(raw.trim.right), 0.45),
      bottom: Math.min(share(raw.trim.bottom), 0.45),
    };
  }
  return adjust.focus || adjust.trim ? adjust : null;
};

/** The card an editor state describes, as the renderer wants it. */
const cardFromState = async (
  state: EditorState,
  options: { foil?: boolean; sampleKeyword?: boolean } = {},
): Promise<BattleCard> => {
  const saved = state.id ? await collection().getOne(state.id) : null;
  const fields = state.fields;
  const spread = { power: fields.power, wit: fields.wit, heart: fields.heart };
  const definition: V2CardDefinitionRecord = {
    ...(saved ?? {
      keyword: "",
      set_piece: "",
      art_url: "",
      legacy_card: "",
    }),
    ...fields,
    id: saved?.id ?? "unsaved",
    card_type: deriveType(spread),
    cost: RARITY_COST[fields.rarity],
  } as V2CardDefinitionRecord;

  const file = state.candidate ? candidatePath(state.key, state.candidate) : null;
  return {
    ...toBattleCard({
      id: saved?.id ?? "unsaved",
      user_id: "",
      server_id: "",
      identifier: "",
      card: definition.id ?? "",
      foil: !!options.foil,
      // Only ever a stand-in, to show how ability text sits: a card has no
      // keyword of its own.
      keyword: options.sampleKeyword ? "vanguard" : "",
      acquired_from: "preview",
      definition,
    }),
    ...(file ? { artUrl: `file://${file}`, legacyCard: "" } : {}),
    artAdjust: state.adjust === undefined ? (saved?.art_adjust ?? null) : state.adjust,
  };
};

const VIEWS = ["plain", "foil", "strip", "dungeon"] as const;
type View = (typeof VIEWS)[number];

const renderView = async (
  state: EditorState,
  view: View,
  sampleKeyword: boolean,
  /** For looking at closely: the size Discord is sent, or a little over. */
  large = false,
): Promise<Buffer | null> => {
  const card = await cardFromState(state, { foil: view === "foil", sampleKeyword });
  if (view === "strip") return renderHandStrip([card], { width: large ? 1140 : 620 });
  if (view === "dungeon") {
    const scene = await renderDungeonScene({
      phase: "room",
      depth: 5,
      room: { kind: "fight", tier: "boss", enemy: card, geld: 27 },
      doors: [],
    });
    return scene ? (large ? scene : sharp(scene).resize({ width: 620 }).toBuffer()) : null;
  }
  return renderCardImage(card, { width: large ? 760 : 420 });
};

/** The artwork a state would use, cut the way the renderer will see it. */
const artOf = async (state: EditorState): Promise<Buffer | null> => {
  const file = state.candidate ? candidatePath(state.key, state.candidate) : null;
  if (file) return loadArt({ buffer: await readFile(file) });
  if (!state.id) return null;

  const saved = await collection().getOne(state.id);
  const source = await resolveArtSource({
    art_url: saved.art ? pb.files.getURL(saved, saved.art) : saved.art_url,
    legacy_card: saved.legacy_card,
    // Bars come off before the subject is marked; the mark is what is being set.
    art_adjust: saved.art_adjust?.trim ? { trim: saved.art_adjust.trim } : null,
  });
  return loadArt(source);
};

const copyCounts = async (): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  const copies = await pb
    .collection<V2UserCardRecord>("v2_user_card")
    .getFullList({ fields: "card" });
  for (const copy of copies) counts.set(copy.card, (counts.get(copy.card) ?? 0) + 1);
  return counts;
};

const describe = (row: V2CardDefinitionRecord, copies: number) => ({
  id: row.id,
  card_name: row.card_name,
  series: row.series,
  rarity: kindOf(row),
  card_type: row.card_type,
  power: row.power,
  wit: row.wit,
  heart: row.heart,
  tags: row.tags ?? [],
  set: row.set ?? 0,
  population: row.population ?? 0,
  active: !!row.active,
  flavour: row.flavour ?? "",
  artist: row.artist ?? "",
  art_adjust: row.art_adjust ?? null,
  /** Where its picture comes from: its own file, the v1 card, a link, or nowhere. */
  art: row.art ? "own" : row.legacy_card ? "v1" : row.art_url ? "link" : "none",
  origin: row.legacy_card ? "V1" : "V2",
  copies,
  updated: row.updated ?? "",
});

/**
 * Keeps set numbers in step with the cards. A card made, removed or renamed
 * moves the ones after it; a failure here is not a failure to save.
 */
const renumber = () =>
  renumberSets().catch((error) => console.error("Set numbers were not updated:", error));

const logEdit = (entry: Record<string, unknown>) =>
  appendFile(EDITS_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);

/** Drops a card's cached thumbnails, so the catalogue redraws it. */
const forgetThumbs = async (id: string) => {
  try {
    for (const name of await readdir(THUMBS)) {
      if (name.startsWith(`${id}-`)) await rm(path.join(THUMBS, name), { force: true });
    }
  } catch {
    // No cache yet.
  }
};

/** Creates or updates a card from an editor state. */
const saveCard = async (state: EditorState) => {
  const fields = state.fields;
  if (!fields.card_name) throw new Error("A card needs a name");
  const spread = { power: fields.power, wit: fields.wit, heart: fields.heart };
  const check = validateSpread(spread, fields.rarity);
  if (!check.valid) throw new Error(`Stats are not legal: ${check.issues.join("; ")}`);

  const before = state.id ? await collection().getOne(state.id) : null;
  const file = state.candidate ? candidatePath(state.key, state.candidate) : null;
  if (state.candidate && !file) throw new Error("Unknown candidate image");

  const form = new FormData();
  const set = (name: string, value: unknown) => form.append(name, String(value));
  set("card_name", fields.card_name);
  set("series", fields.series);
  set("rarity", fields.rarity);
  set("secret_art", fields.secret_art);
  set("power", fields.power);
  set("wit", fields.wit);
  set("heart", fields.heart);
  set("card_type", deriveType(spread));
  set("cost", RARITY_COST[fields.rarity]);
  set("set", fields.set);
  set("population", fields.population);
  set("active", fields.active);
  set("flavour", fields.flavour);
  set("artist", fields.artist);
  form.append("tags", JSON.stringify(fields.tags));

  if (file) {
    form.append(
      "art",
      new File([await readFile(file)], state.candidate!, {
        type: file.toLowerCase().endsWith(".png") ? "image/png" : file.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg",
      }),
    );
  }
  // A new image starts clean: bars trimmed off the old one are not its bars.
  const adjust = state.adjust === undefined ? (before?.art_adjust ?? null) : state.adjust;
  form.append(
    "art_adjust",
    JSON.stringify(file && adjust?.trim ? (adjust.focus ? { focus: adjust.focus } : null) : adjust),
  );

  let saved: V2CardDefinitionRecord;
  if (before) {
    saved = await collection().update(before.id!, form);
  } else {
    set("keyword", "");
    set("set_piece", "");
    set("art_url", "");
    set("legacy_card", "");
    saved = await collection().create(form);
    // Its candidates were filed under a temporary key until it had an id.
    const temporary = folderOf(state.key);
    const permanent = folderOf(saved.id ?? "");
    if (temporary && permanent && state.key !== saved.id) {
      await rename(temporary, permanent).catch(() => undefined);
    }
  }
  if (file && !saved.art) throw new Error("The image did not save - is the art migration applied?");

  await logEdit({ action: before ? "update" : "create", id: saved.id, name: saved.card_name, before, after: saved });
  await forgetThumbs(saved.id ?? "");
  await renumber();
  return saved;
};

/** A starting spread for a new rarity of an existing card, keeping its lean. */
const leanSpread = (base: V2CardDefinitionRecord, rarity: CardRarity) => {
  const exponent = SPIKE_GAMMA[rarity] / SPIKE_GAMMA[base.rarity];
  const spread = normalizeSpread(
    {
      power: Math.pow(base.power, exponent),
      wit: Math.pow(base.wit, exponent),
      heart: Math.pow(base.heart, exponent),
    },
    rarity,
  );

  // Rounding to whole points can leave two stats level at the top, and then
  // the card's type is an accident of which is listed first. Where the base
  // card has a clear lead, a point moves across to keep it.
  const stats = ["power", "wit", "heart"] as const;
  const lead = stats.find((stat) => stats.every((other) => other === stat || base[stat] > base[other]));
  const top = Math.max(spread.power, spread.wit, spread.heart);
  const rival = stats.find((stat) => stat !== lead && spread[stat] === top);
  if (
    lead &&
    rival &&
    spread[lead] === top &&
    top < RULES.spikeCeiling[rarity] &&
    spread[rival] > RULES.statFloor
  ) {
    spread[lead] += 1;
    spread[rival] -= 1;
  }
  return spread;
};

/* ------------------------------------------------------------- first run --- */

let prepared: Promise<void> | null = null;

/** Makes the folders, and brings across what the picker had collected. */
const prepare = (): Promise<void> =>
  (prepared ??= (async () => {
    const fresh = !(await Bun.file(path.join(DATA, ".ready")).exists());
    await mkdir(CANDIDATES, { recursive: true });
    await mkdir(THUMBS, { recursive: true });
    if (!fresh) return;

    type OldCard = { id: string; folder: string; draft?: { committedId?: string } };
    for (const card of await readJson<OldCard[]>(path.join(OLD_PICKER, "cards.json"), [])) {
      // A draft the picker applied is a pool card now, and files under its id.
      const key = card.draft ? card.draft.committedId : card.id;
      const target = key ? folderOf(key) : null;
      if (!target) continue;
      try {
        const source = path.join(OLD_PICKER, card.folder);
        await mkdir(target, { recursive: true });
        for (const name of await readdir(source)) {
          await copyFile(path.join(source, name), path.join(target, name));
        }
      } catch {
        // A card with no folder had no candidates to bring.
      }
    }
    const wikis = await readJson<Record<string, string>>(path.join(OLD_PICKER, "wikis.json"), {});
    if (Object.keys(wikis).length > 0) await writeFile(WIKIS_FILE, JSON.stringify(wikis, null, 2));
    await writeFile(path.join(DATA, ".ready"), new Date().toISOString());
  })());

/* ----------------------------------------------------------------- routes --- */

const jpegResponse = async (image: Buffer, cache = "no-store") =>
  new Response(
    await sharp(image).flatten({ background: "#14162a" }).jpeg({ quality: 88 }).toBuffer(),
    { headers: { "Content-Type": "image/jpeg", "Cache-Control": cache } },
  );

const stateOf = (raw: any): EditorState => {
  const key = String(raw?.key ?? raw?.id ?? "");
  if (!SAFE_KEY.test(key)) throw new Error("Bad card key");
  return {
    id: raw?.id ? String(raw.id) : undefined,
    key,
    fields: cleanFields(raw?.fields),
    candidate: raw?.candidate ? String(raw.candidate) : undefined,
    adjust: raw?.adjust === undefined ? undefined : cleanAdjust(raw.adjust),
  };
};

/** Handles everything under `/cards`. */
export const handleCardManager = async (request: Request, url: URL): Promise<Response> => {
  await prepare();
  const route = url.pathname.replace(/^\/cards\/?/, "");
  const param = (name: string) => url.searchParams.get(name) ?? "";
  const posted = request.method === "POST";

  try {
    if (route === "") {
      return new Response(Bun.file(PAGE_FILE), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    if (route === "api/catalogue") {
      const [rows, copies] = await Promise.all([collection().getFullList(), copyCounts()]);
      // The frame each rarity's art has to fill, at the size cards print.
      const artWindow = Object.fromEntries(
        RARITIES.map((rarity) => {
          const layout = layoutFor(rarity, false);
          const scale = CARD_WIDTH / layout.width;
          return [rarity, { w: Math.round(layout.art.w * scale), h: Math.round(layout.art.h * scale) }];
        }),
      );
      return json({
        cards: rows.map((row) => describe(row, copies.get(row.id ?? "") ?? 0)),
        rules: {
          total: RULES.statTotal,
          floor: RULES.statFloor,
          ceiling: { ...RULES.spikeCeiling, secret_art: RULES.spikeCeiling.full_art },
          population: { ...POPULATION, secret_art: SECRET_ART_POPULATION },
          defaultSet: DEFAULT_SET,
          artWindow: { ...artWindow, secret_art: artWindow.full_art },
        },
      });
    }

    if (route === "thumb") {
      // The catalogue's picture of a card, cached until the card changes.
      const id = param("id");
      if (!SAFE_KEY.test(id)) return fail("Bad id");
      const file = path.join(THUMBS, `${id}-${slug(param("v")) || "0"}.jpg`);
      if (!(await Bun.file(file).exists())) {
        const row = await collection().getOne(id);
        const image = await renderCardImage(
          toBattleCard({ id: row.id, user_id: "", server_id: "", identifier: "", card: row.id ?? "", foil: false, acquired_from: "preview", definition: row }),
          { width: 300 },
        );
        if (!image) return fail("Could not render that", 500);
        await forgetThumbs(id);
        await writeFile(file, await sharp(image).flatten({ background: "#14162a" }).jpeg({ quality: 84 }).toBuffer());
      }
      return new Response(Bun.file(file), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "max-age=31536000, immutable" },
      });
    }

    if (route === "render" && posted) {
      const body = await request.json();
      const view = VIEWS.find((name) => name === body.view) ?? "plain";
      const image = await renderView(stateOf(body), view, !!body.sampleKeyword, !!body.large);
      return image ? jpegResponse(image) : fail("Could not render that", 500);
    }

    if (route === "art" && posted) {
      const image = await artOf(stateOf(await request.json()));
      if (!image) return fail("This card has no artwork", 404);
      return jpegResponse(await sharp(image).resize({ width: 1100, withoutEnlargement: true }).toBuffer());
    }

    if (route === "api/save" && posted) {
      const saved = await saveCard(stateOf(await request.json()));
      return json(describe(saved, (await copyCounts()).get(saved.id ?? "") ?? 0));
    }

    if (route === "api/delete" && posted) {
      const { id } = await request.json();
      const before = await collection().getOne(String(id));
      const owned = (await copyCounts()).get(before.id ?? "") ?? 0;
      // A card someone holds a copy of is not ours to remove.
      if (owned > 0) return fail(`${owned} copies of this card are owned. Make it inactive instead.`);
      await collection().delete(before.id!);
      await logEdit({ action: "delete", id: before.id, name: before.card_name, before });
      await forgetThumbs(before.id ?? "");
      await renumber();
      return json({ ok: true });
    }

    if (route === "api/spread" && posted) {
      // A legal spread: the nearest to what was typed, or one that keeps
      // another card's lean at a new rarity.
      const body = await request.json();
      const rarity = rarityOf(body.rarity);
      if (body.basedOn) {
        return json(leanSpread(await collection().getOne(String(body.basedOn)), rarity));
      }
      return json(
        normalizeSpread(
          { power: Number(body.power) || 1, wit: Number(body.wit) || 1, heart: Number(body.heart) || 1 },
          rarity,
        ),
      );
    }

    if (route === "api/new-rarity" && posted) {
      // The fields for a new rarity of a card, for the editor to open unsaved.
      const body = await request.json();
      const base = await collection().getOne(String(body.basedOn));
      const rarity = rarityOf(body.rarity);
      const secret = body.rarity === "secret_art";
      const fields = {
        card_name: base.card_name,
        series: base.series,
        // As the page names it.
        rarity: secret ? "secret_art" : rarity,
        ...leanSpread(base, rarity),
        tags: (base.tags ?? []).filter(
          (tag, index) => tag !== "legacy" && tag !== slug(base.series) && !(index === 1 && COLOUR_TAGS.has(tag)),
        ),
        set: DEFAULT_SET,
        population: secret ? SECRET_ART_POPULATION : POPULATION[rarity],
        active: false,
        flavour: "",
        artist: "",
      };
      // The images gathered for the character come along, so they need not be
      // found again. Copied, not shared: removing one here leaves the other's.
      const from = folderOf(base.id ?? "");
      const to = folderOf(String(body.key ?? ""));
      const carried = from && to && from !== to ? await readdir(from).catch(() => []) : [];
      if (carried.length > 0) await mkdir(to!, { recursive: true });
      for (const name of carried) {
        if (!SAFE_FILE.test(name) && name !== "sources.json" && name !== "artists.json") continue;
        await copyFile(path.join(from!, name), path.join(to!, name));
      }
      return json(fields);
    }

    if (route === "api/candidates") {
      return json(await listCandidates(param("key")));
    }

    if (route === "candidate") {
      const file = candidatePath(param("key"), param("file"));
      if (!file) return fail("Unknown candidate", 404);
      const width = Math.min(Math.max(Number(param("w")) || 360, 80), 1400);
      return new Response(
        await sharp(file)
          .resize({ width, withoutEnlargement: true })
          // Mid grey, so a transparent background reads as one.
          .flatten({ background: "#6b7090" })
          .jpeg({ quality: 84 })
          .toBuffer(),
        { headers: { "Content-Type": "image/jpeg", "Cache-Control": "max-age=86400" } },
      );
    }

    if (route === "api/add" && posted) {
      const body = await request.json();
      return json({
        file: await downloadCandidate(String(body.key), String(body.url), String(body.artist ?? "").trim()),
      });
    }

    if (route === "api/upload" && posted) {
      // An image from the reviewer's own machine: dropped, chosen or pasted.
      const bytes = Buffer.from(await request.arrayBuffer());
      if (bytes.length === 0) return fail("Nothing was uploaded");
      return json({ file: await storeCandidate(param("key"), bytes, "") });
    }

    if (route === "api/remove" && posted) {
      const body = await request.json();
      const file = candidatePath(String(body.key), String(body.file));
      if (!file) return fail("Unknown candidate", 404);
      await rm(file, { force: true });
      return json({ ok: true });
    }

    if (route === "api/wikis") {
      return json(await guessWikis(param("name").trim(), param("series").trim()));
    }

    if (route === "remote-thumb") {
      // Only ever Danbooru's image host: this is not an open relay.
      const target = new URL(param("url"));
      if (target.protocol !== "https:" || target.hostname !== "cdn.donmai.us") return fail("Not a thumbnail this serves");
      const image = await fetch(target, {
        headers: { "User-Agent": agentFor(target) },
        signal: AbortSignal.timeout(30000),
      });
      if (!image.ok) return fail(`Thumbnail failed (${image.status})`, 502);
      return new Response(await image.arrayBuffer(), {
        headers: {
          "Content-Type": image.headers.get("content-type") ?? "image/jpeg",
          "Cache-Control": "max-age=86400",
        },
      });
    }

    if (route === "api/art-search") {
      // The credited sources: by the card's name, or by a search typed in.
      const name = param("name").trim();
      const raw = param("q").trim();
      if (!name && !raw) return fail("Give the card a name first");
      if (param("source") === "danbooru") return json(await searchDanbooru(name, param("series").trim(), raw, param("safe") !== "0"));
      if (param("source") === "scryfall") return json(await searchScryfall(name, raw));
      return fail("Unknown source");
    }

    if (route === "api/search") {
      const domain = param("wiki").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return fail("Enter a wiki's domain, like naruto.fandom.com");
      if (param("q").trim().length < 2) return fail("Enter something to search for");

      const hits = await searchWiki(domain, param("q").trim());
      // A wiki that had pictures is remembered for the rest of its series.
      const series = param("series").trim();
      if (series && hits.length > 0) {
        const wikis = await readJson<Record<string, string>>(WIKIS_FILE, {});
        if (wikis[series] !== domain) {
          await writeFile(WIKIS_FILE, JSON.stringify({ ...wikis, [series]: domain }, null, 2));
        }
      }
      return json(hits);
    }

    return fail("Not found", 404);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 500);
  }
};
