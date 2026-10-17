import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { TYPE_ICON_PATHS } from "../../modules/finicards/cardArt/battleBoard";
import { TYPE_PALETTES } from "../../modules/finicards/cardArt/palettes";
import { TYPE_PRIORITY } from "../../modules/finicards/rules";
import type { CardType } from "../../types/PocketbaseTablesV2";

/**
 * The bot's Finicards emoji: Power, Wit and Heart as circles in the cards' own
 * colours, each carrying the glyph the battle board draws for it, and the card
 * itself - the site's favicon.
 *
 *   bun --env-file=.env run scripts/finicards/emoji.ts            draw only
 *   bun --env-file=.env run scripts/finicards/emoji.ts --upload   and upload
 *   bun --env-file=.env run scripts/finicards/emoji.ts --upload card   just one
 *
 * Drawn into `modules/finicards/assets`. With `--upload` they are also set as
 * emoji of the bot's own Discord application - which work in every server the
 * bot is in - and their ids are written to `emoji.json`, which is what the game
 * reads (`TYPE_EMOJI` and `CARD_EMOJI` in `rules.ts`). An emoji already there under the
 * same name is replaced, which gives it a new id and breaks it in old messages,
 * so name the ones that changed. A different bot has different ids: run this
 * for it.
 */

const ASSETS = path.join(
  import.meta.dir,
  "..",
  "..",
  "modules",
  "finicards",
  "assets",
);
const IDS_FILE = path.join(ASSETS, "emoji.json");
const FAVICON = path.join(
  import.meta.dir,
  "..",
  "..",
  "web",
  "public",
  "favicon.svg",
);
const SIZE = 128;
/** An emoji's key in `emoji.json`: a card type, or `card` for the card. */
type EmojiKey = CardType | "card";
const emojiName = (key: EmojiKey) => `fc_${key}`;

const draw = (type: CardType): Promise<Buffer> => {
  const palette = TYPE_PALETTES[type];
  // The glyphs are outlines in a 10x10 box; here they sit in the middle 58%.
  const scale = (SIZE * 0.58) / 10;
  const offset = (SIZE - 10 * scale) / 2;
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
      <defs><radialGradient id="g" cx="0.36" cy="0.3" r="0.8">
        <stop offset="0" stop-color="${palette.bright}"></stop><stop offset="0.7" stop-color="${palette.main}"></stop>
        <stop offset="1" stop-color="${palette.deep}"></stop></radialGradient></defs>
      <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2 - 3}" fill="url(#g)" stroke="${palette.deeper}" stroke-width="5"></circle>
      <path transform="translate(${offset} ${offset}) scale(${scale})" d="${TYPE_ICON_PATHS[type]}" fill="none"
        stroke="#ffffff" stroke-width="1.15" stroke-linejoin="round" stroke-linecap="round"></path>
    </svg>`),
  )
    .png()
    .toBuffer();
};

const api = async (
  route: string,
  init: { method?: string; body?: string } = {},
): Promise<any> => {
  const response = await fetch(`https://discord.com/api/v10${route}`, {
    ...init,
    headers: {
      Authorization: `Bot ${process.env.FINI_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok)
    throw new Error(
      `${init.method ?? "GET"} ${route}: ${response.status} ${await response.text()}`,
    );
  return response.status === 204 ? null : response.json();
};

/** The favicon, square and transparent around the card. */
const drawCard = async (): Promise<Buffer> =>
  sharp(await readFile(FAVICON), { density: (72 * SIZE) / 64 })
    .resize(SIZE, SIZE)
    .png()
    .toBuffer();

await mkdir(ASSETS, { recursive: true });
const images = new Map<EmojiKey, Buffer>();
for (const type of TYPE_PRIORITY) {
  const image = await draw(type);
  images.set(type, image);
  const file = path.join(ASSETS, `type-${type}.png`);
  await writeFile(file, image);
  console.log(`drew ${file}`);
}
images.set("card", await drawCard());
await writeFile(path.join(ASSETS, "card.png"), images.get("card")!);
console.log(`drew ${path.join(ASSETS, "card.png")}`);

if (process.argv.includes("--upload")) {
  if (!process.env.FINI_TOKEN) throw new Error("FINI_TOKEN is not set");
  const application = (await api("/applications/@me")).id as string;
  const existing: { id: string; name: string }[] =
    (await api(`/applications/${application}/emojis`)).items ?? [];

  const ids: Record<string, string> = await readFile(IDS_FILE, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => ({}));

  // Names after --upload pick which emoji go up; none means all of them.
  const picked = process.argv
    .slice(process.argv.indexOf("--upload") + 1)
    .filter((arg): arg is EmojiKey => images.has(arg as EmojiKey));
  for (const key of picked.length > 0 ? picked : images.keys()) {
    const name = emojiName(key);
    const old = existing.find((emoji) => emoji.name === name);
    if (old)
      await api(`/applications/${application}/emojis/${old.id}`, {
        method: "DELETE",
      });
    const made = await api(`/applications/${application}/emojis`, {
      method: "POST",
      body: JSON.stringify({
        name,
        image: `data:image/png;base64,${images.get(key)!.toString("base64")}`,
      }),
    });
    ids[key] = `<:${made.name}:${made.id}>`;
    console.log(`${old ? "replaced" : "uploaded"} ${ids[key]}`);
  }

  await writeFile(IDS_FILE, `${JSON.stringify(ids, null, 2)}\n`);
  console.log(`wrote ${IDS_FILE}`);
}
process.exit(0);
