import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { TYPE_ICON_PATHS } from "../modules/finicardsV2/cardArt/battleBoard";
import { TYPE_PALETTES } from "../modules/finicardsV2/cardArt/palettes";
import { TYPE_PRIORITY } from "../modules/finicardsV2/rules";
import type { CardType } from "../types/PocketbaseTablesV2";

/**
 * The type emoji: Power, Wit and Heart as circles in the cards' own colours,
 * each carrying the glyph the battle board draws for it.
 *
 *   bun --env-file=.env run scripts/finicards_v2_type_emoji.ts            draw only
 *   bun --env-file=.env run scripts/finicards_v2_type_emoji.ts --upload   and upload
 *
 * Drawn into `modules/finicardsV2/assets`. With `--upload` they are also set as
 * emoji of the bot's own Discord application - which work in every server the
 * bot is in - and their ids are written to `type-emoji.json`, which is what the
 * game reads (`TYPE_EMOJI` in `rules.ts`). An emoji already there under the
 * same name is replaced. A different bot has different ids: run this for it.
 */

const ASSETS = path.join(import.meta.dir, "..", "modules", "finicardsV2", "assets");
const IDS_FILE = path.join(ASSETS, "type-emoji.json");
const SIZE = 128;
const emojiName = (type: CardType) => `fc_${type}`;

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

const api = async (route: string, init: { method?: string; body?: string } = {}): Promise<any> => {
  const response = await fetch(`https://discord.com/api/v10${route}`, {
    ...init,
    headers: {
      Authorization: `Bot ${process.env.FINI_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${route}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
};

await mkdir(ASSETS, { recursive: true });
const images = new Map<CardType, Buffer>();
for (const type of TYPE_PRIORITY) {
  const image = await draw(type);
  images.set(type, image);
  const file = path.join(ASSETS, `type-${type}.png`);
  await writeFile(file, image);
  console.log(`drew ${file}`);
}

if (process.argv.includes("--upload")) {
  if (!process.env.FINI_TOKEN) throw new Error("FINI_TOKEN is not set");
  const application = (await api("/applications/@me")).id as string;
  const existing: { id: string; name: string }[] = (await api(`/applications/${application}/emojis`)).items ?? [];

  const ids: Record<string, string> = await readFile(IDS_FILE, "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => ({}));

  for (const type of TYPE_PRIORITY) {
    const name = emojiName(type);
    const old = existing.find((emoji) => emoji.name === name);
    if (old) await api(`/applications/${application}/emojis/${old.id}`, { method: "DELETE" });
    const made = await api(`/applications/${application}/emojis`, {
      method: "POST",
      body: JSON.stringify({ name, image: `data:image/png;base64,${images.get(type)!.toString("base64")}` }),
    });
    ids[type] = `<:${made.name}:${made.id}>`;
    console.log(`${old ? "replaced" : "uploaded"} ${ids[type]}`);
  }

  await writeFile(IDS_FILE, `${JSON.stringify(ids, null, 2)}\n`);
  console.log(`wrote ${IDS_FILE}`);
}
process.exit(0);
