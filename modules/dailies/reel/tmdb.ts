import sharp from "sharp";
import { FRAMES, type Film } from "./game";

/**
 * Reel's window on TMDB (themoviedb.org): the films to pick from, their frames,
 * and the search a typed guess is matched with. Needs `TMDB_TOKEN`, the API
 * read access token. TMDB asks to be credited wherever its data is shown.
 */

const API = "https://api.themoviedb.org/3";
const IMAGES = "https://image.tmdb.org/t/p";

export const TMDB_CREDIT = "Film data and images from TMDB.";

/**
 * The pool is the most-voted films of all time, this many pages of twenty: the
 * top 1,000, down to about 5,400 votes. Further down, the films get hard to
 * know from a frame.
 */
export const POOL_PAGES = 50;

/** Narrower frames are too small to make anything out in. */
const MIN_FRAME_WIDTH = 1280;
/** Frames are chosen from a film's most-voted: below these they turn odd - black, blurred, near-repeats. */
const FRAME_CANDIDATES = 15;

export const tmdbConfigured = (): boolean => !!process.env.TMDB_TOKEN;

const tmdb = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${process.env.TMDB_TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`TMDB ${path}: ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
};

type TmdbFilm = {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  vote_count?: number;
};

/**
 * Below this, a search result is someone's home movie, not a film anyone
 * means: a typo of "Interstellar" finds one called "Interstelar" with no votes.
 * Matching it would cost a frame for a slip, so it's no match at all instead.
 */
const MIN_MATCH_VOTES = 100;

type TmdbImage = {
  file_path: string;
  width: number;
  vote_count: number;
};

const filmOf = (film: TmdbFilm): Film => ({
  movieId: film.id,
  title: film.title,
  year: film.release_date?.slice(0, 4) ?? "",
});

/** A frame's address, at a width Discord shows well. */
export const frameUrl = (path: string, size = "w1280"): string =>
  `${IMAGES}/${size}${path}`;

/** One page of the pool, most-voted first. `page` is 1-based. */
export const poolPage = async (page: number): Promise<Film[]> => {
  const { results } = await tmdb<{ results: TmdbFilm[] }>(
    `/discover/movie?sort_by=vote_count.desc&include_adult=false&page=${page}`,
  );
  return results.map(filmOf);
};

/** A film's most-voted stills wide enough to show: what frames are picked from. */
const frameCandidates = (images: TmdbImage[]): TmdbImage[] =>
  images
    .filter((image) => image.width >= MIN_FRAME_WIDTH)
    .sort((a, b) => b.vote_count - a.vote_count)
    .slice(0, FRAME_CANDIDATES);

/** A picture's rough shape, 64 bits of "is this patch brighter than the next". */
export type Fingerprint = boolean[];

/** Fingerprints differing in this many bits or fewer are the same shot. */
const SAME_SHOT_BITS = 12;

const sameShot = (a: Fingerprint, b: Fingerprint): boolean =>
  a.filter((bit, i) => bit !== b[i]).length <= SAME_SHOT_BITS;

/** The fingerprint of an image: a difference hash, cheap and blind to crops' small shifts. */
export const fingerprint = async (image: Buffer): Promise<Fingerprint> => {
  const pixels = await sharp(image)
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();
  return Array.from({ length: 64 }, (_, i) => {
    const at = Math.floor(i / 8) * 9 + (i % 8);
    return pixels[at] > pixels[at + 1];
  });
};

/**
 * The five frames to show, hardest first: from a film's most-voted text-free
 * stills, spread evenly, so the round opens on a quiet shot and ends on the one
 * everyone remembers. A still that's the same shot as one already kept - TMDB
 * holds the same promo picture in several crops - is passed over, or a player
 * would spend a frame on one they've seen. Null when the film hasn't five.
 */
export const pickFrames = (
  images: TmdbImage[],
  prints: Map<string, Fingerprint> = new Map(),
): string[] | null => {
  const kept: TmdbImage[] = [];
  for (const image of frameCandidates(images)) {
    const print = prints.get(image.file_path);
    const repeat =
      print &&
      kept.some((other) => {
        const otherPrint = prints.get(other.file_path);
        return otherPrint && sameShot(print, otherPrint);
      });
    if (!repeat) kept.push(image);
  }
  if (kept.length < FRAMES) return null;
  const step = (kept.length - 1) / (FRAMES - 1);
  return Array.from(
    { length: FRAMES },
    (_, i) => kept[Math.round(i * step)].file_path,
  ).reverse();
};

/** A film's frames to show, or null if it hasn't five good ones. */
export const framesFor = async (movieId: number): Promise<string[] | null> => {
  // `null` language: the stills with no title or text on them.
  const { backdrops } = await tmdb<{ backdrops: TmdbImage[] }>(
    `/movie/${movieId}/images?include_image_language=null`,
  );
  const prints = new Map<string, Fingerprint>();
  await Promise.all(
    frameCandidates(backdrops).map(async ({ file_path }) => {
      const response = await fetch(frameUrl(file_path, "w92"), {
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!response?.ok) return;
      prints.set(
        file_path,
        await fingerprint(Buffer.from(await response.arrayBuffer())),
      );
    }),
  );
  return pickFrames(backdrops, prints);
};

const normalise = (title: string) =>
  title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "Dune (1984)" or "dune 1984" → a title and year to search with. */
export const parseGuess = (typed: string): { title: string; year?: string } => {
  const match = typed.trim().match(/^(.*?)[\s,]*\(?((?:18|19|20)\d{2})\)?$/);
  return match && match[1]
    ? { title: match[1].trim(), year: match[2] }
    : { title: typed.trim() };
};

/**
 * The film a typed guess means, or null if TMDB knows none by that name.
 *
 * Search ranks by relevance, which usually puts the famous film first - but
 * "Dune" means the 1984 one just as much as the 2021 one. So when the answer
 * is among the results and has exactly the title typed, the guess is taken to
 * mean it: naming a remake's title is naming the film. A trailing year narrows
 * the search, unless nothing comes back - then it was part of the title.
 */
export const matchGuess = async (
  typed: string,
  answerId: number,
): Promise<Film | null> => {
  const { title, year } = parseGuess(typed);
  if (!title) return null;
  const search = async (query: string, year?: string) => {
    const params = new URLSearchParams({ query, include_adult: "false" });
    if (year) params.set("year", year);
    return (await tmdb<{ results: TmdbFilm[] }>(`/search/movie?${params}`))
      .results;
  };
  const withYear = await search(title, year);
  const match = pickMatch(withYear, title, answerId, year);
  if (match || !year) return match;
  // A number at the end can be the title's own: "Blade Runner 2049".
  return pickMatch(await search(typed.trim()), typed.trim(), answerId);
};

/** `matchGuess`'s choice among search results; see there. */
export const pickMatch = (
  results: TmdbFilm[],
  title: string,
  answerId: number,
  year?: string,
): Film | null => {
  const known = results.filter(
    (film) => (film.vote_count ?? 0) >= MIN_MATCH_VOTES,
  );
  if (!known.length) return null;
  const wanted = normalise(title);
  const answer = known.find(
    (film) =>
      film.id === answerId &&
      // A year typed is the year meant: "Dune 2021" isn't the 1984 one.
      (!year || film.release_date?.startsWith(year)) &&
      [film.title, film.original_title ?? ""].some(
        (name) => normalise(name) === wanted,
      ),
  );
  return filmOf(answer ?? known[0]);
};
