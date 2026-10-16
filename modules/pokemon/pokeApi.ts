import type { PokemonType } from "./typeEffective";

/**
 * Looks a name up on PokeAPI: a Pokemon first, then an ability, a move, and an
 * item, and returns the first that exists. Used by `/pokemon`.
 */

const POKEAPI_URL = "https://pokeapi.co/api/v2";

/** The order names are tried in: "metronome" is a move, "leftovers" an item. */
const KINDS = ["pokemon", "ability", "move", "item"] as const;

export type PokeApiKind = (typeof KINDS)[number];

// PokeAPI's responses are large; only the fields /pokemon shows are typed.
type Named = { name: string };
type EffectEntry = { effect: string; language: Named };

export type PokemonData = Named & {
  types: { type: { name: PokemonType } }[];
  abilities: { ability: Named }[];
  stats: { base_stat: number; stat: Named }[];
  sprites: { other: { home: { front_default: string } } };
};

export type EffectData = Named & {
  effect_entries: EffectEntry[];
  /** Moves only. */
  type?: Named;
};

export type PokeApiResult =
  | { kind: "pokemon"; data: PokemonData }
  | { kind: Exclude<PokeApiKind, "pokemon">; data: EffectData };

/** "Mr Mime" -> "mr-mime", the slug PokeAPI names things by. */
export const pokeApiSlug = (text: string) => text.trim().toLowerCase().replaceAll(" ", "-");

/** The first kind of thing the name matches, or null when it matches none. */
export const findOnPokeApi = async (name: string): Promise<PokeApiResult | null> => {
  const slug = encodeURIComponent(pokeApiSlug(name));
  for (const kind of KINDS) {
    const response = await fetch(`${POKEAPI_URL}/${kind}/${slug}`);
    if (response.ok) return { kind, data: await response.json() } as PokeApiResult;
  }
  return null;
};

/** An ability's, move's or item's English description. */
export const englishEffect = (data: EffectData) =>
  data.effect_entries
    .filter((entry) => entry.language.name === "en")
    .map((entry) => entry.effect)
    .join(", ");
