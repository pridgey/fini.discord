import { FRAMES, type Film } from "./game";
import { withoutPromo } from "./promo";
import { distinctShots, prepareShot, type Shot } from "./shots";

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
/**
 * Frames are chosen from a film's most-voted: below these they turn odd -
 * black, blurred. Twenty leaves enough after repeated shots are dropped.
 */
const FRAME_CANDIDATES = 20;

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
export const frameCandidates = (images: TmdbImage[]): string[] =>
  images
    .filter((image) => image.width >= MIN_FRAME_WIDTH)
    .sort((a, b) => b.vote_count - a.vote_count)
    .slice(0, FRAME_CANDIDATES)
    .map((image) => image.file_path);

/**
 * The five frames to show from a film's distinct stills, most-voted first:
 * spread evenly and reversed, so the round opens on a quiet shot and ends on
 * the one everyone remembers. Null when there aren't five.
 */
export const pickFrames = (stills: string[]): string[] | null => {
  if (stills.length < FRAMES) return null;
  const step = (stills.length - 1) / (FRAMES - 1);
  return Array.from(
    { length: FRAMES },
    (_, i) => stills[Math.round(i * step)],
  ).reverse();
};

/** A small copy of a still, to compare shots with. Null if it couldn't be had. */
const shotOf = async (path: string): Promise<Shot | null> => {
  const response = await fetch(frameUrl(path, "w92"), {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  return prepareShot(Buffer.from(await response.arrayBuffer()));
};

/** A still at a size a model can judge, for the promo check. */
const judgeableStill = async (path: string): Promise<Buffer | null> => {
  const response = await fetch(frameUrl(path, "w300"), {
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
};

/**
 * A film's frames to show, or null if it hasn't five good ones. Promo art is
 * left out (`promo.ts`), then any still that's the same shot as one already
 * kept (`shots.ts`).
 */
export const framesFor = async (movieId: number): Promise<string[] | null> => {
  // `null` language: the stills with no title or text on them.
  const { backdrops } = await tmdb<{ backdrops: TmdbImage[] }>(
    `/movie/${movieId}/images?include_image_language=null`,
  );
  const candidates = await withoutPromo(
    frameCandidates(backdrops),
    judgeableStill,
  );
  if (candidates.length < FRAMES) return null;
  const shots = new Map<string, Shot>();
  await Promise.all(
    candidates.map(async (path) => {
      const shot = await shotOf(path).catch(() => null);
      if (shot) shots.set(path, shot);
    }),
  );
  return pickFrames(await distinctShots(candidates, shots));
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

/** A film with every name TMDB knows it by: its title, original title, and alternative titles. */
export type NamedFilm = Film & { names: string[] };

/** The answer's names, by film: the same few films are asked about all day. */
const namesCache = new Map<number, Promise<NamedFilm>>();

const namesOf = (movieId: number): Promise<NamedFilm> => {
  const cached = namesCache.get(movieId);
  if (cached) return cached;
  const fetched = tmdb<
    TmdbFilm & { alternative_titles?: { titles?: { title: string }[] } }
  >(`/movie/${movieId}?append_to_response=alternative_titles`).then((film) => ({
    ...filmOf(film),
    names: [
      film.title,
      film.original_title ?? "",
      ...(film.alternative_titles?.titles ?? []).map((alt) => alt.title),
    ].filter(Boolean),
  }));
  // A failed fetch isn't kept: the next guess tries again.
  namesCache.set(movieId, fetched);
  fetched.catch(() => namesCache.delete(movieId));
  return fetched;
};

/**
 * The answer, if the guess is one of its names - and the year typed, if any,
 * is its year. "Seven" is Se7en's American title, but search for it and Se7en
 * isn't in the first page: the films called "7" are.
 */
export const answerByName = (
  answer: NamedFilm,
  title: string,
  year?: string,
): Film | null => {
  if (year && answer.year !== year) return null;
  const wanted = normalise(title);
  return answer.names.some((name) => normalise(name) === wanted)
    ? { movieId: answer.movieId, title: answer.title, year: answer.year }
    : null;
};

/**
 * The film a typed guess means, or null if TMDB knows none by that name.
 *
 * Any of the answer's own names - an alternative or original-language title -
 * counts as naming it. Otherwise it's TMDB's search, which ranks by relevance
 * and usually puts the famous film first - but
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
  const answer = await namesOf(answerId).catch(() => null);
  if (answer) {
    const named =
      answerByName(answer, title, year) ?? answerByName(answer, typed.trim());
    if (named) return named;
  }
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
