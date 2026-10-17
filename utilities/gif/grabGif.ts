import { randomNumber } from "../randomNumber";

type GiphyResponse = { data?: { images: { downsized: { url: string } } }[] };
type TenorResponse = { results?: { url: string }[] };

/** One of `items`, every one equally likely, or undefined when there are none. */
const pickOne = <T>(items: T[] = []): T | undefined =>
  items.length ? items[randomNumber(0, items.length - 1, true)] : undefined;

/**
 * A random GIF matching `query`, as a link, or "" when nothing matched or the
 * search failed.
 */
export const grabGif = async (
  query: string,
  engine: "giphy" | "tenor" = "giphy",
  rating: "g" | "pg" | "pg-13" | "r" = "pg-13",
): Promise<string> => {
  try {
    if (engine === "giphy") {
      const params = new URLSearchParams({
        api_key: process.env.GIPHY_KEY ?? "",
        q: query,
        rating,
      });
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?${params}`,
      );
      const { data } = (await response.json()) as GiphyResponse;
      return pickOne(data)?.images.downsized.url ?? "";
    }

    const params = new URLSearchParams({
      key: process.env.TENOR_KEY ?? "",
      q: query,
    });
    const response = await fetch(`https://g.tenor.com/v1/search?${params}`);
    const { results } = (await response.json()) as TenorResponse;
    return pickOne(results)?.url ?? "";
  } catch (err) {
    console.error("Error grabbing gif:", err);
    return "";
  }
};
