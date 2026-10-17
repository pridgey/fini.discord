import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import {
  CARD_WIDTH,
  loadArt,
  paddingBox,
  renderCardImage,
  trimPadding,
} from "../../modules/finicards/cardArt/generateCardImage";
import { renderDungeonScene } from "../../modules/finicards/cardArt/dungeonScene";
import { renderHandStrip } from "../../modules/finicards/cardArt/handStrip";
import { layoutFor } from "../../modules/finicards/cardArt/layouts";
import type { BattleCard } from "../../modules/finicards/types";
import type { CardDefinitionRecord } from "../../types/PocketbaseTables";
import type {
  ArtAdjust,
  CardRarity,
  V2CardDefinitionRecord,
} from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";
import { handleCardManager } from "../../modules/finicards/cardManager/cardManager";
import { FINICARDS_WORK_DIR } from "../../modules/finicards/workDir";

/**
 * Art check: renders artwork everywhere v2 shows it, onto one page, and flags
 * the images that need a person to look at them.
 *
 *   bun --env-file=.env run scripts/finicards/art-check.ts --all
 *   bun --env-file=.env run scripts/finicards/art-check.ts --set 3
 *   bun run scripts/finicards/art-check.ts --image ~/art/reigen.png --rarity uncommon
 *   bun run scripts/finicards/art-check.ts --dir ~/art/set3
 *
 * `--all` and `--set` check the cards already in the pool. `--image` / `--dir`
 * check files that have not been uploaded anywhere yet; in a directory the
 * rarity is read from a `_c` / `_u` / `_fa` suffix on the file name, the way v1
 * images are named, and falls back to `--rarity`. Add `--out <name>` to give
 * such a check a page of its own (served at `/<name>/`) instead of replacing
 * the pool's.
 *
 * Each card gets its plain frame, its foil frame, a hand strip and a dungeon
 * fight. What it can measure, it flags:
 *
 *   bars     near-black bands baked into an edge of the image
 *   low-res  the art has to be enlarged to fill a frame, so it prints soft
 *   cutout   transparent areas inside the picture, which show the card through
 *   crop     a frame throws away a large share of the picture
 *
 * What it cannot measure is whether a crop landed on the character's face.
 * That is what the pictures are for - the page puts the flagged cards first,
 * and the buttons at the top narrow it to one flag, rarity or set.
 *
 * Reviewing. Every card on the page has verdict buttons and a note, and a
 * click on its source picture marks where the subject is. Served with
 *
 *   bun --env-file=.env run scripts/finicards/art-check.ts --serve
 *
 * (add `--all` to re-render first), the page saves each click to `review.json`
 * beside it, keyed by card id, and reads it back on load - so a review
 * survives a refresh and a re-render. Opened as a plain file it keeps the
 * review in the browser instead, with a button to download it.
 *
 * Applying it. A marked subject and a "trim bars" become a card's
 * `art_adjust`. A re-render already shows them applied, so the page is the
 * preview; writing them to the cards is a separate step:
 *
 *   bun --env-file=.env run scripts/finicards/art-check.ts --apply-review
 *   bun --env-file=.env run scripts/finicards/art-check.ts --apply-review --commit
 *
 * Without `--commit` it only reports what it would write.
 *
 * Replacing an image outright, and everything else about a card, is the card
 * manager's job (`cardManager.ts`), which `--serve` puts at
 * `/cards/`.
 */

/** What `--serve` serves. */
const SERVE_ROOT = path.join(FINICARDS_WORK_DIR, "art-check");

/** Width the page's renders are made at. The real cards are `CARD_WIDTH`. */
const PREVIEW_WIDTH = 300;

/** A frame enlarging its art by more than this is flagged `low-res`. */
const UPSCALE_LIMIT = 1.15;
/** A frame discarding more than this share of the picture is flagged `crop`. */
const CROP_LIMIT = 0.45;

type Flag = "bars" | "low-res" | "cutout" | "crop";

type Subject = { card: BattleCard; file: string; label: string };

function slugOf(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

/**
 * Where this run's page goes. `--out <name>` puts it in a folder of its own
 * under the served one, so a side check (candidate images, say) does not
 * replace the pool's page and keeps a separate review.
 */
const OUT_DIR = flag("out")
  ? path.join(SERVE_ROOT, slugOf(flag("out")!))
  : SERVE_ROOT;
const REVIEW_FILE = path.join(OUT_DIR, "review.json");

const slug = slugOf;

const RARITY_SUFFIX: Record<string, CardRarity> = {
  c: "common",
  u: "uncommon",
  fa: "full_art",
  l: "full_art",
};

const placeholderCard = (name: string, rarity: CardRarity): BattleCard => ({
  instanceId: slug(name),
  definitionId: slug(name),
  name,
  series: "Art check",
  rarity,
  type: "wit",
  stats: { power: 4, wit: 7, heart: 4 },
  keyword: "vanguard",
  foil: false,
  tags: ["first_tag", "second_tag"],
  cost: 1,
});

const fromFile = (file: string, fallback: CardRarity): Subject => {
  const stem = path.basename(file, path.extname(file));
  const match = stem.match(/^(.*?)_(c|u|fa|l)(?:_[A-Za-z0-9]{10})?$/);
  const name = (match ? match[1] : stem)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    card: placeholderCard(name, match ? RARITY_SUFFIX[match[2]] : fallback),
    file: path.resolve(file),
    label: path.basename(file),
  };
};

/**
 * Pool cards, with their artwork pulled down once so every render reuses it.
 * `set` narrows it to one release; without it, the whole pool.
 */
const fromPool = async (set?: number): Promise<Subject[]> => {
  const legacy = await pb
    .collection<CardDefinitionRecord>("card_definition")
    .getFullList(set ? { filter: `set = ${set}` } : {});
  const definitions = await pb
    .collection<V2CardDefinitionRecord>("v2_card_definition")
    .getFullList();
  const byLegacy = new Map(definitions.map((row) => [row.legacy_card, row]));

  const subjects: Subject[] = [];
  for (const row of legacy) {
    const definition = byLegacy.get(row.id ?? "");
    if (!definition || !row.image) continue;

    const response = await fetch(pb.files.getURL(row, row.image));
    if (!response.ok) continue;
    const file = path.join(
      OUT_DIR,
      "source",
      `${row.id}${path.extname(row.image)}`,
    );
    await writeFile(file, Buffer.from(await response.arrayBuffer()));

    subjects.push({
      file,
      label: row.image,
      card: {
        instanceId: definition.id ?? "",
        definitionId: definition.id ?? "",
        name: definition.card_name,
        series: definition.series,
        rarity: definition.rarity,
        type: definition.card_type,
        stats: {
          power: definition.power,
          wit: definition.wit,
          heart: definition.heart,
        },
        // A pool card has no keyword of its own (copies roll theirs), so the
        // preview borrows one to show how the ability text sits.
        keyword: "vanguard",
        foil: false,
        tags: definition.tags ?? [],
        cost: definition.cost ?? 0,
        flavour: definition.flavour ?? "",
        artist: definition.artist ?? "",
        // `artUrl` still wins for the artwork; these only feed the footer.
        legacyCard: definition.legacy_card ?? "",
        set: definition.set || row.set || 0,
      },
    });
  }
  return subjects;
};

/** Share of the source a cover-crop into `window` throws away, 0 to 1. */
const cropLoss = (source: number, window: number): number =>
  1 - Math.min(source / window, window / source);

/**
 * Near-black bands along the edges of a picture, as a share of its width or
 * height per edge.
 *
 * Deliberately narrow: only rows and columns that are black from end to end
 * count. A flat coloured background also has uniform edges, and is not a
 * fault; a letterbox bar is always black and always exactly straight.
 */
const blackBars = async (
  art: Buffer,
  /** Brightest a channel may be and still count as bar. */
  limit = 18,
): Promise<{ top: number; bottom: number; left: number; right: number }> => {
  const { data, info } = await sharp(art)
    .flatten({ background: "#808080" })
    .resize({ width: 240 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const dark = (x: number, y: number): boolean => {
    const at = (y * width + x) * 3;
    return data[at] < limit && data[at + 1] < limit && data[at + 2] < limit;
  };
  const rowDark = (y: number): boolean => {
    for (let x = 0; x < width; x++) if (!dark(x, y)) return false;
    return true;
  };
  const columnDark = (x: number): boolean => {
    for (let y = 0; y < height; y++) if (!dark(x, y)) return false;
    return true;
  };
  const run = (
    length: number,
    test: (index: number) => boolean,
    reverse: boolean,
  ) => {
    let count = 0;
    while (count < length && test(reverse ? length - 1 - count : count))
      count++;
    // An image that is black all over is dark art, not bars.
    return count === length ? 0 : count / length;
  };

  return {
    top: run(height, rowDark, false),
    bottom: run(height, rowDark, true),
    left: run(width, columnDark, false),
    right: run(width, columnDark, true),
  };
};

/** Share of the picture that is see-through once its padding is cut off. */
const transparentShare = async (art: Buffer): Promise<number> => {
  const meta = await sharp(art).metadata();
  if (!meta.hasAlpha) return 0;

  const alpha = await sharp(art)
    .resize({ width: 200 })
    .extractChannel("alpha")
    .raw()
    .toBuffer();
  let clear = 0;
  for (const value of alpha) if (value < 128) clear++;
  return clear / alpha.length;
};

type ReviewEntry = {
  name: string;
  rarity: string;
  fixes: string[];
  /** Where the subject is, as a fraction of the image exactly as stored. */
  focus?: { x: number; y: number };
  note?: string;
};

const loadReview = async (): Promise<Record<string, ReviewEntry>> => {
  try {
    return JSON.parse((await readFile(REVIEW_FILE)).toString());
  } catch {
    return {};
  }
};

const keyOf = (subject: Subject): string =>
  subject.card.legacyCard ? subject.card.definitionId : subject.label;

/**
 * Turns one card's review into the corrections the renderer applies.
 *
 * The page marks the subject on the image as stored, padding, bars and all.
 * The renderer crops what is left once those are cut away, so the mark is
 * moved into that picture's coordinates here, once, rather than on every
 * render.
 */
const adjustFor = async (
  file: string,
  entry: ReviewEntry | undefined,
): Promise<{ adjust: ArtAdjust | null; notes: string[] }> => {
  if (!entry) return { adjust: null, notes: [] };

  const notes: string[] = [];
  const stored = await readFile(file);
  const meta = await sharp(stored).metadata();
  const full = { w: meta.width ?? 1, h: meta.height ?? 1 };
  // The picture inside its transparent padding, in the stored image's pixels.
  const picture = (await paddingBox(stored)) ?? {
    left: 0,
    top: 0,
    width: full.w,
    height: full.h,
  };

  const adjust: ArtAdjust = {};

  if (entry.fixes.includes("bars")) {
    // Someone has looked at this image and said it has bars, so off-black
    // counts here where the unprompted flag would not risk it.
    const bars = await blackBars(await trimPadding(stored), 40);
    // A hair past the measured edge, so no sliver of the bar survives.
    const pad = (share: number) =>
      share >= 0.01
        ? Math.round(Math.min(share + 0.006, 0.45) * 1000) / 1000
        : 0;
    const trim = {
      left: pad(bars.left),
      top: pad(bars.top),
      right: pad(bars.right),
      bottom: pad(bars.bottom),
    };
    if (trim.left + trim.top + trim.right + trim.bottom > 0) {
      adjust.trim = trim;
      notes.push(
        `review: bars trimmed (${Object.entries(trim)
          .filter(([, share]) => share > 0)
          .map(([edge, share]) => `${edge} ${Math.round(share * 100)}%`)
          .join(", ")})`,
      );
    } else if (picture.width < full.w || picture.height < full.h) {
      notes.push("review: bars were transparent padding, already trimmed");
    } else {
      notes.push("review: bars marked, but none found to trim");
    }
  }

  if (entry.focus) {
    const trim = adjust.trim ?? { left: 0, top: 0, right: 0, bottom: 0 };
    const kept = {
      left: picture.left + picture.width * trim.left,
      top: picture.top + picture.height * trim.top,
      width: picture.width * (1 - trim.left - trim.right),
      height: picture.height * (1 - trim.top - trim.bottom),
    };
    const within = (value: number) =>
      Math.round(Math.min(Math.max(value, 0), 1) * 1000) / 1000;
    adjust.focus = {
      x: within((entry.focus.x * full.w - kept.left) / kept.width),
      y: within((entry.focus.y * full.h - kept.top) / kept.height),
    };
    notes.push("review: crop centred on the marked subject");
  }

  if (entry.fixes.includes("replace"))
    notes.push("review: image to be replaced");

  return { adjust: adjust.trim || adjust.focus ? adjust : null, notes };
};

const jpeg = (buffer: Buffer): Promise<Buffer> =>
  sharp(buffer)
    .flatten({ background: "#14162a" })
    .jpeg({ quality: 84 })
    .toBuffer();

const checkSubject = async (
  subject: Subject,
  index: number,
  entry: ReviewEntry | undefined,
) => {
  // A reviewed card is rendered with its corrections, so the page is a preview
  // of the fix rather than a second look at the problem.
  const reviewed = await adjustFor(subject.file, entry);

  // The renderers fetch `artUrl`, and a file: url keeps them on the same crop
  // path production uses rather than a preview-only one.
  const card = {
    ...subject.card,
    artUrl: `file://${subject.file}`,
    artAdjust: reviewed.adjust,
  };
  const stem = `${String(index).padStart(3, "0")}-${slug(card.name)}-${card.rarity}`;

  // Measured on what the renderers will actually crop: padding and any
  // reviewed bars already gone.
  const art =
    (await loadArt({
      buffer: await readFile(subject.file),
      adjust: reviewed.adjust,
    })) ?? (await readFile(subject.file));
  const meta = await sharp(art).metadata();
  const size = { w: meta.width ?? 1, h: meta.height ?? 1 };
  const aspect = size.w / size.h;

  const flags = new Set<Flag>();
  const notes: string[] = [...reviewed.notes];

  const bars = await blackBars(art);
  const barred = Object.entries(bars).filter(([, share]) => share >= 0.025);
  if (barred.length > 0) {
    flags.add("bars");
    notes.push(
      `black bars: ${barred.map(([edge, share]) => `${edge} ${Math.round(share * 100)}%`).join(", ")}`,
    );
  }

  const clear = await transparentShare(art);
  if (clear > 0.03) {
    flags.add("cutout");
    notes.push(`${Math.round(clear * 100)}% of the picture is transparent`);
  }

  const frames = card.rarity === "full_art" ? [false] : [false, true];
  const shots: { title: string; file: string; loss: number }[] = [];
  let upscale = 0;

  for (const foil of frames) {
    const layout = layoutFor(card.rarity, foil);
    const buffer = await renderCardImage(
      { ...card, foil },
      { width: PREVIEW_WIDTH },
    );
    if (!buffer) continue;

    // How far the art is stretched to cover this frame at the size cards print.
    const scale = CARD_WIDTH / layout.width;
    upscale = Math.max(
      upscale,
      (layout.art.w * scale) / size.w,
      (layout.art.h * scale) / size.h,
    );

    const file = `${stem}-${foil ? "foil" : "plain"}.jpg`;
    await writeFile(path.join(OUT_DIR, file), await jpeg(buffer));
    shots.push({
      title: `${foil ? "foil" : "plain"} · ${layout.file.replace(".svg", "")}`,
      file,
      loss: cropLoss(aspect, layout.art.w / layout.art.h),
    });
  }

  if (upscale > UPSCALE_LIMIT) {
    flags.add("low-res");
    notes.push(`enlarged ${upscale.toFixed(2)}× to fill its frame`);
  }

  const strip = await renderHandStrip([card], { width: 560 });
  const scene = await renderDungeonScene({
    phase: "room",
    depth: 5,
    room: { kind: "fight", tier: "boss", enemy: card, geld: 27 },
    doors: [],
  });
  for (const [title, buffer] of [
    ["hand strip / battle board", strip],
    ["dungeon fight", scene],
  ] as const) {
    if (!buffer) continue;
    const file = `${stem}-${slug(title)}.jpg`;
    await writeFile(
      path.join(OUT_DIR, file),
      await jpeg(await sharp(buffer).resize({ width: 420 }).toBuffer()),
    );
    shots.push({ title, file, loss: cropLoss(aspect, 1) });
  }

  // Only the card frames count toward the flag: every thumbnail is square, so
  // counting those would flag every wide image in the pool.
  const frameLoss = Math.max(
    0,
    ...shots
      .filter((shot) => shot.file.match(/-(plain|foil)\.jpg$/))
      .map((shot) => shot.loss),
  );
  // A crop someone has placed by hand is no longer a guess to be flagged.
  if (frameLoss > CROP_LIMIT && !reviewed.adjust?.focus) {
    flags.add("crop");
    notes.push(
      `a frame crops away ${Math.round(frameLoss * 100)}% of the picture`,
    );
  }

  const thumb = `${stem}-source.jpg`;
  await writeFile(
    path.join(OUT_DIR, thumb),
    await sharp(subject.file)
      .resize({ height: 300, withoutEnlargement: true })
      // Mid grey, so both transparent padding and black bars stand out.
      .flatten({ background: "#6b7090" })
      .jpeg({ quality: 84 })
      .toBuffer(),
  );

  return {
    subject,
    // What a review is filed under: the card's own id, so it outlives a
    // re-render. A loose file has no id, and goes by its name.
    key: keyOf(subject),
    adjust: reviewed.adjust,
    shots,
    thumb,
    flags: [...flags],
    notes,
    source: `${size.w}×${size.h}`,
    frameLoss,
  };
};

type Result = Awaited<ReturnType<typeof checkSubject>>;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const FLAG_ORDER: Flag[] = ["bars", "cutout", "low-res", "crop"];

const buildPage = (results: Result[]): string => {
  const pct = (loss: number) => `${Math.round(loss * 100)}%`;
  const tone = (loss: number) =>
    loss > CROP_LIMIT ? "bad" : loss > 0.25 ? "warn" : "ok";
  const count = (name: Flag) =>
    results.filter((result) => result.flags.includes(name)).length;
  const flagged = results.filter((result) => result.flags.length > 0).length;
  const sets = [
    ...new Set(results.map((result) => result.subject.card.set ?? 0)),
  ].sort();

  const button = (group: string, value: string, label: string) =>
    `<button data-group="${group}" data-value="${value}">${label}</button>`;

  return `<!doctype html><meta charset="utf-8"><title>Finicards v2 art check</title>
<style>
body{background:#14162a;color:#e8e9f1;font:14px system-ui;margin:24px}
h1{font-size:20px;margin:0 0 6px} p{color:#9aa1c4;margin:0 0 14px}
nav{position:sticky;top:0;background:#14162a;padding:10px 0;border-bottom:1px solid #2b3050;z-index:1}
nav span{color:#9aa1c4;margin:0 6px 0 14px} nav span:first-child{margin-left:0}
button{background:#1f2340;color:#e8e9f1;border:1px solid #2b3050;border-radius:14px;padding:4px 11px;margin:2px;cursor:pointer;font:inherit}
button.on{background:#5865f2;border-color:#5865f2}
section{border-top:1px solid #2b3050;padding:16px 0}
h2{font-size:16px;margin:0 0 4px} small{color:#9aa1c4;font-weight:400}
.flag{display:inline-block;border-radius:4px;padding:1px 7px;margin-right:5px;font-size:12px;font-weight:700;color:#14162a}
.bars{background:#ff7a7a}.cutout{background:#c49bff}.low-res{background:#f0c060}.crop{background:#7fc8ff}
.notes{color:#c9cde6;margin:4px 0 0}
.row{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-top:10px}
figure{margin:0} figcaption{font-size:12px;margin-bottom:4px}
img{display:block;max-height:340px;max-width:420px;border-radius:6px}
.ok{color:#7fd6a0}.warn{color:#f0c060}.bad{color:#ff7a7a}
.review{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:10px}
.review button.on[data-fix="ok"]{background:#2f9e62;border-color:#2f9e62}
.review button.on{background:#c2566f;border-color:#c2566f}
.review input{flex:1;min-width:220px;background:#0f1122;color:#e8e9f1;border:1px solid #2b3050;border-radius:6px;padding:5px 9px;font:inherit}
.pick{position:relative;cursor:crosshair}
.pick i{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #fff;border-radius:50%;background:#ff3d7f;box-shadow:0 0 0 2px #000;pointer-events:none}
section.done-ok{opacity:.55}
#saved{color:#7fd6a0}
</style>
<h1>Art check — ${results.length} cards, ${flagged} flagged</h1>
<p>Flagged cards first. A flag is something measurable; whether a crop landed on the character is for your eyes.</p>
<nav>
<span>Flag</span>${button("flag", "", "all")}${button("flag", "any", `any flag (${flagged})`)}${FLAG_ORDER.map((name) => button("flag", name, `${name} (${count(name)})`)).join("")}
<span>Rarity</span>${button("rarity", "", "all")}${["common", "uncommon", "full_art"].map((rarity) => button("rarity", rarity, rarity.replace("_", " "))).join("")}
${sets.length > 1 ? `<span>Set</span>${button("set", "", "all")}${sets.map((set) => button("set", String(set), set ? `S${set}` : "none")).join("")}` : ""}
<span>Review</span>${button("review", "", "all")}${button("review", "todo", "not reviewed")}${button("review", "fix", "needs a fix")}${button("review", "ok", "looks good")}
<span id="shown"></span><span id="saved"></span>
</nav>
${results
  .map(
    (
      result,
    ) => `<section data-key="${escapeHtml(result.key)}" data-name="${escapeHtml(result.subject.card.name)}" data-flags="${result.flags.join(" ")}" data-rarity="${result.subject.card.rarity}" data-set="${result.subject.card.set ?? 0}"><h2>${result.flags.map((name) => `<span class="flag ${name}">${name}</span>`).join("")}${escapeHtml(result.subject.card.name)} <small>${result.subject.card.rarity.replace("_", " ")}${result.subject.card.set ? ` · S${result.subject.card.set}` : ""} · ${result.source} · ${escapeHtml(result.subject.label)}</small></h2>
${result.notes.length ? `<div class="notes">${result.notes.map(escapeHtml).join(" · ")}</div>` : ""}
<div class="review">
<button data-fix="ok">Looks good</button><button data-fix="crop">Bad crop</button><button data-fix="bars">Trim bars</button><button data-fix="replace">Replace image</button>
<input placeholder="Note (optional)">
</div>
<div class="row"><figure><figcaption>source — click the subject to mark it</figcaption><div class="pick"><img loading="lazy" src="${result.thumb}"></div></figure>${result.shots
      .map(
        (shot) =>
          `<figure><figcaption>${shot.title} · <span class="${tone(shot.loss)}">${pct(shot.loss)} cropped</span></figcaption><img loading="lazy" src="${shot.file}"></figure>`,
      )
      .join("")}</div></section>`,
  )
  .join("\n")}
<script>
/* ---- the review: { [card key]: { name, rarity, fixes: [], focus: {x, y}, note } } ---- */
let review = {};
const served = location.protocol.startsWith("http");
const savedLabel = document.getElementById("saved");

const save = async () => {
  try {
    if (served) {
      const response = await fetch("review.json", { method: "POST", body: JSON.stringify(review) });
      if (!response.ok) throw new Error(response.status);
      savedLabel.textContent = "saved";
    } else {
      localStorage.setItem("art-review", JSON.stringify(review));
      savedLabel.innerHTML = 'kept in this browser · <a href="#" id="download" style="color:#7fc8ff">download review.json</a>';
      document.getElementById("download").onclick = (event) => {
        event.preventDefault();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([JSON.stringify(review, null, 2)], { type: "application/json" }));
        link.download = "review.json";
        link.click();
      };
    }
  } catch (error) {
    savedLabel.textContent = "NOT SAVED (" + error.message + ")";
    savedLabel.style.color = "#ff7a7a";
  }
};

const entryFor = (section) =>
  (review[section.dataset.key] ??= {
    name: section.dataset.name,
    rarity: section.dataset.rarity,
    fixes: [],
  });

const paint = (section) => {
  const entry = review[section.dataset.key];
  const fixes = entry?.fixes ?? [];
  for (const button of section.querySelectorAll(".review button")) {
    button.classList.toggle("on", fixes.includes(button.dataset.fix));
  }
  section.classList.toggle("done-ok", fixes.includes("ok"));
  section.querySelector(".review input").value = entry?.note ?? "";
  section.querySelector(".pick i")?.remove();
  if (entry?.focus) {
    const dot = document.createElement("i");
    dot.style.left = entry.focus.x * 100 + "%";
    dot.style.top = entry.focus.y * 100 + "%";
    section.querySelector(".pick").append(dot);
  }
};

const changed = (section) => {
  const entry = review[section.dataset.key];
  // Nothing said about a card is the same as never having touched it.
  if (entry && entry.fixes.length === 0 && !entry.note && !entry.focus) {
    delete review[section.dataset.key];
  }
  paint(section);
  apply();
  save();
};

for (const section of document.querySelectorAll("section")) {
  for (const button of section.querySelectorAll(".review button")) {
    button.onclick = () => {
      const entry = entryFor(section);
      const fix = button.dataset.fix;
      if (entry.fixes.includes(fix)) entry.fixes = entry.fixes.filter((other) => other !== fix);
      // "Looks good" and a fix contradict each other, so picking one clears the other.
      else if (fix === "ok") { entry.fixes = ["ok"]; delete entry.focus; }
      else entry.fixes = [...entry.fixes.filter((other) => other !== "ok"), fix];
      changed(section);
    };
  }

  section.querySelector(".review input").onchange = (event) => {
    entryFor(section).note = event.target.value.trim();
    changed(section);
  };

  // Marking the subject is what a bad crop needs, so it files one.
  const pick = section.querySelector(".pick");
  pick.onclick = (event) => {
    const box = pick.querySelector("img").getBoundingClientRect();
    const entry = entryFor(section);
    entry.focus = {
      x: Math.round(((event.clientX - box.left) / box.width) * 1000) / 1000,
      y: Math.round(((event.clientY - box.top) / box.height) * 1000) / 1000,
    };
    entry.fixes = [...new Set([...entry.fixes.filter((fix) => fix !== "ok"), "crop"])];
    changed(section);
  };
}

/* ---- filters ---- */
const picked = { flag: "", rarity: "", set: "", review: "" };
const apply = () => {
  let shown = 0;
  let reviewed = 0;
  for (const section of document.querySelectorAll("section")) {
    const flags = section.dataset.flags.split(" ").filter(Boolean);
    const fixes = review[section.dataset.key]?.fixes ?? [];
    if (fixes.length > 0) reviewed++;
    const state = fixes.length === 0 ? "todo" : fixes.includes("ok") ? "ok" : "fix";
    const ok =
      (picked.flag === "" || (picked.flag === "any" ? flags.length > 0 : flags.includes(picked.flag))) &&
      (picked.rarity === "" || section.dataset.rarity === picked.rarity) &&
      (picked.set === "" || section.dataset.set === picked.set) &&
      (picked.review === "" || picked.review === state);
    section.style.display = ok ? "" : "none";
    if (ok) shown++;
  }
  document.getElementById("shown").textContent =
    shown + " shown · " + reviewed + " of " + document.querySelectorAll("section").length + " reviewed · ";
  for (const button of document.querySelectorAll("nav button")) {
    button.classList.toggle("on", picked[button.dataset.group] === button.dataset.value);
  }
};
for (const button of document.querySelectorAll("nav button")) {
  button.onclick = () => { picked[button.dataset.group] = button.dataset.value; apply(); };
}

(async () => {
  try {
    review = served
      ? await (await fetch("review.json", { cache: "no-store" })).json()
      : JSON.parse(localStorage.getItem("art-review") ?? "{}");
  } catch { review = {}; }
  for (const section of document.querySelectorAll("section")) paint(section);
  apply();
})();
</script>`;
};

/**
 * Serves the page and takes its review back.
 *
 * Localhost only: it writes a file on every click, and is meant to be reached
 * through an ssh tunnel, not from the network.
 */
const serve = (port: number) => {
  Bun.serve({
    hostname: "127.0.0.1",
    port,
    // The default is ten seconds, and searching a large wiki takes longer.
    // Spread in because the installed Bun types predate the option.
    ...({ idleTimeout: 120 } as object),
    async fetch(request) {
      const url = new URL(request.url);

      // Managing the pool itself is its own tool, served alongside.
      if (url.pathname === "/cards" || url.pathname.startsWith("/cards/")) {
        return handleCardManager(request, url);
      }
      // Where the image picker it grew out of used to live.
      if (url.pathname === "/pick" || url.pathname.startsWith("/pick/")) {
        return Response.redirect("/cards/", 302);
      }

      const target = path.join(
        SERVE_ROOT,
        decodeURIComponent(
          url.pathname.endsWith("/")
            ? `${url.pathname}index.html`
            : url.pathname,
        ),
      );
      // Nothing outside the served folder.
      if (!target.startsWith(SERVE_ROOT + path.sep))
        return new Response("no", { status: 403 });

      // Each page keeps its review beside it.
      if (path.basename(target) === "review.json") {
        if (request.method === "POST") {
          // Parsed before it is written, so a bad request cannot wreck the file.
          const review = await request.json();
          if (
            typeof review !== "object" ||
            review === null ||
            Array.isArray(review)
          ) {
            return new Response("expected an object", { status: 400 });
          }
          await writeFile(target, JSON.stringify(review, null, 2));
          return new Response("ok");
        }
        const file = Bun.file(target);
        return (await file.exists()) ? new Response(file) : Response.json({});
      }

      const file = Bun.file(target);
      return (await file.exists())
        ? new Response(file, { headers: { "Cache-Control": "no-store" } })
        : new Response("not found", { status: 404 });
    },
  });
  console.log(`\nServing the review page on http://127.0.0.1:${port}`);
};

/**
 * Writes the review's corrections onto the cards. Reports only, unless
 * `commit`.
 */
const applyReview = async (commit: boolean) => {
  const review = await loadReview();
  const subjects = await fromPool();
  const writes: {
    id: string;
    name: string;
    adjust: ArtAdjust | null;
    notes: string[];
  }[] = [];

  for (const subject of subjects) {
    const entry = review[keyOf(subject)];
    if (!entry) continue;
    const { adjust, notes } = await adjustFor(subject.file, entry);
    if (adjust || notes.length > 0) {
      writes.push({
        id: subject.card.definitionId,
        name: subject.card.name,
        adjust,
        notes,
      });
    }
  }

  const adjusted = writes.filter((write) => write.adjust);
  for (const write of writes) {
    console.log(
      `${write.name.padEnd(30)} ${write.adjust ? JSON.stringify(write.adjust) : "(nothing to write)"}  ${write.notes.join("; ")}`,
    );
  }
  console.log(
    `\n${adjusted.length} cards get an art_adjust; ${writes.length - adjusted.length} reviewed with nothing to write.`,
  );

  if (!commit) {
    console.log("Dry run. Add --commit to write them.");
    return;
  }

  let written = 0;
  for (const write of adjusted) {
    const saved = await pb
      .collection<V2CardDefinitionRecord>("v2_card_definition")
      .update(write.id, { art_adjust: write.adjust });
    // Pocketbase accepts a field it does not have and stores nothing, so check.
    if (!saved.art_adjust) {
      throw new Error(
        "art_adjust did not save. Copy the 1787292800 migration into pb_migrations and restart Pocketbase first.",
      );
    }
    written++;
  }
  console.log(`Wrote ${written}.`);
};

const run = async () => {
  await mkdir(path.join(OUT_DIR, "source"), { recursive: true });

  if (args.includes("--apply-review")) {
    await applyReview(args.includes("--commit"));
    return;
  }

  const fallback = (flag("rarity") ?? "common") as CardRarity;
  const subjects: Subject[] = [];
  const set = flag("set");
  const image = flag("image");
  const dir = flag("dir");

  if (args.includes("--all")) subjects.push(...(await fromPool()));
  else if (set) subjects.push(...(await fromPool(Number(set))));
  if (image) subjects.push(fromFile(image, fallback));
  if (dir) {
    const glob = new Bun.Glob("*.{png,jpg,jpeg,webp,gif}");
    for await (const file of glob.scan({ cwd: dir, absolute: true })) {
      subjects.push(fromFile(file, fallback));
    }
  }

  if (subjects.length === 0) {
    // `--serve` alone just puts the page that is already there back up.
    if (!args.includes("--serve")) {
      console.log(
        "Nothing to check. Pass --all, --set <n>, --image <file> or --dir <folder>.",
      );
    }
    return;
  }

  const review = await loadReview();

  // A few at a time: each card is several renders, and the pool is hundreds.
  const results: Result[] = [];
  const BATCH = 4;
  for (let start = 0; start < subjects.length; start += BATCH) {
    results.push(
      ...(await Promise.all(
        subjects
          .slice(start, start + BATCH)
          .map((subject, offset) =>
            checkSubject(subject, start + offset, review[keyOf(subject)]),
          ),
      )),
    );
    process.stdout.write(`\r${results.length} / ${subjects.length}`);
  }
  process.stdout.write("\n");

  // Most flags first, then the hardest crop.
  results.sort(
    (a, b) => b.flags.length - a.flags.length || b.frameLoss - a.frameLoss,
  );

  const page = path.join(OUT_DIR, "index.html");
  await writeFile(page, buildPage(results));

  // The same list as a file, for working through outside the browser.
  const list = path.join(OUT_DIR, "flagged.csv");
  await writeFile(
    list,
    [
      "card,rarity,set,source,flags,notes,file",
      ...results
        .filter((result) => result.flags.length > 0)
        .map((result) =>
          [
            result.subject.card.name,
            result.subject.card.rarity,
            result.subject.card.set ?? "",
            result.source,
            result.flags.join(" "),
            result.notes.join("; "),
            result.subject.label,
          ]
            .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
            .join(","),
        ),
    ].join("\n"),
  );

  for (const name of FLAG_ORDER) {
    const hits = results.filter((result) => result.flags.includes(name));
    console.log(`${name.padEnd(8)} ${hits.length}`);
  }
  console.log(
    `${results.filter((result) => result.flags.length > 0).length} of ${results.length} flagged\n\n${page}\n${list}`,
  );
};

await run();
if (args.includes("--serve")) serve(Number(flag("port") ?? 8765));
else process.exit(0);
