import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { resolveArtSource } from "../../modules/finicards/cardArt/generateCardImage";
import {
  LEGENDARY_GIF_EFFECTS,
  renderLegendaryGif,
} from "../../modules/finicards/cardArt/legendaryGif";
import type { BattleCard } from "../../modules/finicards/types";
import type { V2CardDefinitionRecord } from "../../types/PocketbaseTablesV2";
import { pb } from "../../utilities/pocketbase";
import { FINICARDS_WORK_DIR } from "../../modules/finicards/workDir";

/**
 * Renders Legendary GIFs to disk, for looking at and tuning the effects.
 *
 *   bun --env-file=.env run scripts/finicards/foil-prototype.ts --card Vegeta
 *   bun --env-file=.env run scripts/finicards/foil-prototype.ts --card Videl --effect facets
 *   bun run scripts/finicards/foil-prototype.ts --image ~/art/x.png --name "Mystery"
 *   bun --env-file=.env run scripts/finicards/foil-prototype.ts --card Videl --effect facets --reveal
 *
 * `--reveal` renders the pull reveal instead of the loop. `--frames` and
 * `--delay` override an effect's own timing.
 *
 * The effects themselves live in the game now
 * (`modules/finicards/cardArt/legendaryGif.ts`); this only drives them.
 */

const OUT_DIR = path.join(FINICARDS_WORK_DIR, "foil");

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

/* ------------------------------------------------------------------- run --- */

const loadCard = async (): Promise<{
  card: BattleCard;
  art: Buffer | null;
}> => {
  const image = flag("image");

  if (image) {
    const name = flag("name") ?? "Legendary";
    return {
      art: await sharp(image).toBuffer(),
      card: {
        instanceId: "prototype",
        definitionId: "prototype",
        name,
        series: flag("series") ?? "Prototype",
        rarity: "full_art",
        type: (flag("type") as BattleCard["type"]) ?? "wit",
        stats: { power: 2, wit: 12, heart: 1 },
        keyword: "adapt",
        foil: true,
        tags: ["legendary"],
        cost: 5,
      },
    };
  }

  const wanted = flag("card") ?? "Vegeta";
  const definition = await pb
    .collection<V2CardDefinitionRecord>("v2_card_definition")
    .getFirstListItem(
      pb.filter('card_name ~ {:wanted} && rarity = "full_art"', { wanted }),
    );

  // A card's own artwork file wins over a linked image, as it does in the game.
  const source = await resolveArtSource({
    ...definition,
    art_url: definition.art
      ? pb.files.getURL(definition, definition.art)
      : definition.art_url,
  });
  const response = source?.url ? await fetch(source.url) : null;

  return {
    art: response?.ok ? Buffer.from(await response.arrayBuffer()) : null,
    card: {
      instanceId: definition.id ?? "",
      definitionId: definition.id ?? "",
      name: definition.card_name,
      series: definition.series,
      rarity: "full_art",
      type: definition.card_type,
      stats: {
        power: definition.power,
        wit: definition.wit,
        heart: definition.heart,
      },
      keyword: definition.keyword ?? "",
      foil: true,
      tags: definition.tags ?? [],
      cost: definition.cost ?? 0,
    },
  };
};

const run = async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const { card, art } = await loadCard();

  const only = flag("effect");
  const names = only ? [only] : Object.keys(LEGENDARY_GIF_EFFECTS);
  const stem = card.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const number = (name: string) =>
    flag(name) ? Number(flag(name)) : undefined;

  for (const name of names) {
    const effect = LEGENDARY_GIF_EFFECTS[name];
    if (!effect) {
      console.log(
        `No effect "${name}". Try: ${Object.keys(LEGENDARY_GIF_EFFECTS).join(", ")}`,
      );
      continue;
    }

    const started = performance.now();
    const reveal = args.includes("--reveal");
    const gif = await renderLegendaryGif(card, art, name, {
      reveal,
      frames: number("frames"),
      delay: number("delay"),
    });
    const file = path.join(
      OUT_DIR,
      `${stem}-${name}${reveal ? "-reveal" : ""}.gif`,
    );
    await writeFile(file, gif);
    console.log(
      `T${effect.tier} ${name.padEnd(10)} ${(gif.length / 1024 / 1024).toFixed(2)} MB  ${Math.round(performance.now() - started)} ms  ${file}`,
    );
  }
};

await run();
process.exit(0);
