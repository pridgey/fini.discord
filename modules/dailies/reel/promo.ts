import Anthropic from "@anthropic-ai/sdk";

/**
 * Telling a film still from promo art.
 *
 * TMDB files posters, key art and photoshoot pictures among a film's
 * backdrops, and nothing marks which is which. Promo art is made to sell the
 * film, so it tends to give it away on frame 1. Nothing simple measured from
 * the pixels separates the two, so a model looks.
 *
 * Tried on thirteen stills labelled by eye: Haiku caught every promo picture,
 * and called a few real stills promo too - the cheap mistake, since a film has
 * plenty of stills to spare (8 to 15 of 20 judged stills, on four films). Sonnet
 * did no better and let a posed photoshoot through. The local Gemma answered
 * "still" to everything.
 */

const MODEL = "claude-haiku-5-5";

const QUESTION =
  "This is one of a film's backdrop images from TMDB. Is it a frame from a scene in the film itself, or promotional material - a poster or key art, a posed photoshoot, a composite or painted image? Answer with exactly one word: STILL or PROMO.";

/** Asks this many at once: a film's candidates in a few rounds, not a burst of twenty. */
const AT_ONCE = 5;

export const promoCheckConfigured = (): boolean =>
  !!process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;

/** True for a film still, false for promo art; null if it couldn't be asked. */
export const isStill = async (image: Buffer): Promise<boolean | null> => {
  client ??= new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 10,
    // A one-word answer: no thinking first, or it spends the tokens on that.
    thinking: { type: "disabled" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: image.toString("base64"),
            },
          },
          { type: "text", text: QUESTION },
        ],
      },
    ],
  });
  const text = response.content.find((block) => block.type === "text");
  const answer = text?.type === "text" ? text.text.trim().toUpperCase() : "";
  if (answer.startsWith("STILL")) return true;
  if (answer.startsWith("PROMO")) return false;
  return null;
};

/**
 * `paths` without the promo art, in order. `fetchImage` gets a still small
 * enough to send. A still that couldn't be fetched or judged is kept: better
 * the odd poster than a round that can't be made. Without an API key, every
 * still is kept.
 */
export const withoutPromo = async (
  paths: string[],
  fetchImage: (path: string) => Promise<Buffer | null>,
  judge: (image: Buffer) => Promise<boolean | null> = isStill,
): Promise<string[]> => {
  if (judge === isStill && !promoCheckConfigured()) return paths;
  const verdicts = new Map<string, boolean | null>();
  for (let i = 0; i < paths.length; i += AT_ONCE) {
    await Promise.all(
      paths.slice(i, i + AT_ONCE).map(async (path) => {
        const image = await fetchImage(path).catch(() => null);
        verdicts.set(path, image ? await judge(image).catch(() => null) : null);
      }),
    );
  }
  return paths.filter((path) => verdicts.get(path) !== false);
};
