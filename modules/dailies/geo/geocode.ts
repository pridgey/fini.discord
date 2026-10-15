import type { LatLon } from "./score";

/**
 * Turns a typed guess into a point and the places it falls in, and names the
 * places a round's photo was taken in. Pasted coordinates ("35.0037, 135.7788",
 * as Google Maps copies them) are taken as they are; anything else is looked
 * up with Nominatim, OpenStreetMap's free place search.
 *
 * Nominatim's usage policy: at most one request a second, and a User-Agent
 * that says who is asking. https://operations.osmfoundation.org/policies/nominatim/
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
export const USER_AGENT = "fini-discord-bot/1.0 (+https://finicards.pridgey.dev)";

/** The places a point is in, as far down as a town. */
export type PlaceInfo = {
  /** ISO 3166-1 alpha-2, upper case. */
  countryCode?: string;
  country?: string;
  /** ISO 3166-2 code of the state or province ("FR-ARA", "JP-13"), when it has one. */
  provinceCode?: string;
  province?: string;
  city?: string;
};

/**
 * How much a guess named. A guess of "Japan" is placed in the middle of Japan,
 * which is inside some prefecture - but naming a country earns country credit,
 * not the prefecture's. Coordinates and anything a town or smaller are "city".
 */
export type GuessLevel = "country" | "province" | "city";

export type GeocodedGuess = LatLon & { label: string; place: PlaceInfo; level: GuessLevel };

type NominatimAddress = Record<string, string | undefined>;

/** The kinds of result that name a country or a province, and no further. */
const COUNTRY_TYPES = new Set(["country", "continent"]);
const PROVINCE_TYPES = new Set(["state", "province", "region", "state_district", "county"]);

export const levelOf = (addressType: string | undefined): GuessLevel =>
  COUNTRY_TYPES.has(addressType ?? "")
    ? "country"
    : PROVINCE_TYPES.has(addressType ?? "")
      ? "province"
      : "city";

/** Reads the places out of a Nominatim address. */
export const placeFromAddress = (address: NominatimAddress = {}): PlaceInfo => ({
  countryCode: address.country_code?.toUpperCase(),
  country: address.country,
  provinceCode: address["ISO3166-2-lvl4"],
  province: address.state ?? address.province ?? address.region,
  city:
    address.city ??
    address.town ??
    address.village ??
    address.hamlet ??
    address.municipality,
});

/** Reads "lat, lon" in decimal degrees, or null if the text isn't that. */
export const parseCoordinates = (text: string): LatLon | null => {
  const match = text
    .trim()
    .match(/^\(?\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
};

let lastRequest = 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One Nominatim request, a second clear of the last. Throws if it fails. */
const nominatim = async <T>(path: "search" | "reverse", params: Record<string, string>): Promise<T> => {
  const wait = lastRequest + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();

  const url = new URL(`${NOMINATIM_URL}/${path}`);
  for (const [key, value] of Object.entries({
    format: "jsonv2",
    addressdetails: "1",
    "accept-language": "en",
    ...params,
  })) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) {
    throw new Error(`Place search failed: ${response?.status ?? "no response"}`);
  }
  return (await response.json()) as T;
};

type NominatimPlace = {
  lat: string;
  lon: string;
  display_name: string;
  addresstype?: string;
  address?: NominatimAddress;
  error?: string;
};

/** The places a point is in, down to its town. Null out at sea, or anywhere nameless. */
export const describePlace = async (point: LatLon): Promise<PlaceInfo | null> => {
  const found = await nominatim<NominatimPlace>("reverse", {
    lat: String(point.lat),
    lon: String(point.lon),
    // Town level: a street or house tells the round nothing more.
    zoom: "10",
  });
  return found.error || !found.address ? null : placeFromAddress(found.address);
};

/** The place a guess names, or null when nothing matches. */
export const geocodeGuess = async (text: string): Promise<GeocodedGuess | null> => {
  const coordinates = parseCoordinates(text);
  if (coordinates) {
    const place = (await describePlace(coordinates)) ?? {};
    return {
      ...coordinates,
      label: [`${coordinates.lat.toFixed(4)}, ${coordinates.lon.toFixed(4)}`, place.city, place.country]
        .filter(Boolean)
        .join(" · "),
      place,
      level: "city",
    };
  }

  const [first] = await nominatim<NominatimPlace[]>("search", { q: text.trim(), limit: "1" });
  if (!first) return null;
  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    label: first.display_name,
    place: placeFromAddress(first.address),
    level: levelOf(first.addresstype),
  };
};
