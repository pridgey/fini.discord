import sharp, { type Sharp } from "sharp";
import { clueScore, MIN_CLUES } from "./clues";
import { USER_AGENT, townOf, type Box } from "./geocode";
import { PLACES } from "./places";
import { distanceKm, type LatLon } from "./score";

/**
 * Street-level photos for a round, from free sources:
 *
 * - Mapillary, when MAPILLARY_TOKEN is set: worldwide, CC BY-SA.
 *   https://www.mapillary.com/developer/api-documentation
 * - Panoramax otherwise: no key, CC BY-SA, strongest in France and Europe.
 *   https://api.panoramax.xyz
 *
 * Mapillary's photos are also checked for how much they give away
 * (`clues.ts`), and a spot with nothing to go on - a footpath beside a wall -
 * is passed over. A Mapillary round shows its town, not one street: the
 * answer's photo, and two more from elsewhere inside the same town
 * (`spreadAcross`). Only where the town has none to give does it fall back to
 * the answer's nearest neighbours.
 *
 * Photos are downloaded and re-encoded before anyone sees them. A source's
 * link, or the GPS tags inside the original file, would give the answer away;
 * sharp drops all metadata on re-encode.
 */

/** One photo the source has near a spot. */
export type Candidate = LatLon & {
  /** Mapillary's image id, for its detections. */
  id?: string;
  /** A 360° panorama, when the source says. */
  pano?: boolean;
  imageUrl: string;
  credit: string;
  license: string;
};

export type GeoRound = {
  /** Where the first photo was taken - the answer. */
  answer: LatLon;
  /** The town the round was looked for near. Revealed with the answer. */
  near: string;
  /** JPEGs, ready to attach. */
  photos: Buffer[];
  credit: string;
  license: string;
  source: "Mapillary" | "Panoramax";
  /** What Mapillary detected in the photos, and its clue score. Mapillary rounds only. */
  clues?: { score: number; found: string[] };
};

const PHOTO_WIDTH = 1280;
/** How far from a town's centre a round may land, in degrees (~5 km). */
const SCATTER = 0.05;
/** Half the side of the box Panoramax is searched in, in degrees (~1 km). */
const SEARCH_RADIUS = 0.01;
/**
 * Mapillary's boxes, smallest first (~100 m, then ~300 m). It refuses a box
 * holding too many photos - "Please reduce the amount of data" - and is slow
 * to say so, which a city centre at Panoramax's size always does. A box that
 * comes back empty is widened; one Mapillary refuses is not.
 */
const MAPILLARY_RADII = [0.001, 0.003];
const ATTEMPTS = 15;
/** Photos in one spot tried for clues before moving on to another spot. */
const TRIES_PER_SPOT = 3;

const fetchJson = async <T>(url: string): Promise<T | null> => {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return response?.ok ? ((await response.json()) as T) : null;
};

const bboxAround = ({ lat, lon }: LatLon, radius = SEARCH_RADIUS) =>
  [lon - radius, lat - radius, lon + radius, lat + radius]
    .map((degrees) => Number(degrees.toFixed(6)))
    .join(",");

/** Panoramax's photos near a spot. */
export const panoramaxNear = async (spot: LatLon): Promise<Candidate[]> => {
  const json = await fetchJson<{
    features?: {
      geometry: { coordinates: [number, number] };
      assets: { hd?: { href: string }; sd?: { href: string } };
      providers?: { name: string; roles: string[] }[];
      properties?: { license?: string };
    }[];
  }>(`https://api.panoramax.xyz/api/search?limit=20&bbox=${bboxAround(spot)}`);

  return (json?.features ?? []).flatMap((feature) => {
    const imageUrl = feature.assets.hd?.href ?? feature.assets.sd?.href;
    if (!imageUrl) return [];
    const [lon, lat] = feature.geometry.coordinates;
    const producer = feature.providers?.find((provider) =>
      provider.roles.includes("producer"),
    );
    return [
      {
        lat,
        lon,
        imageUrl,
        credit: producer?.name ?? "a Panoramax contributor",
        license: feature.properties?.license ?? "CC-BY-SA-4.0",
      },
    ];
  });
};

/** Mapillary's photos near a spot. */
export const mapillaryNear = async (
  spot: LatLon,
  token: string,
): Promise<Candidate[]> => {
  for (const radius of MAPILLARY_RADII) {
    const url = new URL("https://graph.mapillary.com/images");
    url.searchParams.set("access_token", token);
    url.searchParams.set(
      "fields",
      "id,thumb_2048_url,geometry,creator,is_pano",
    );
    url.searchParams.set("bbox", bboxAround(spot, radius));
    url.searchParams.set("limit", "20");

    const json = await fetchJson<MapillaryImages>(url.toString());
    // Refused (too busy) or failed: a wider box would fare no better.
    if (!json) return [];
    const found = mapillaryCandidates(json);
    if (found.length > 0) return found;
  }
  return [];
};

type MapillaryImages = {
  data?: {
    id: string;
    is_pano?: boolean;
    thumb_2048_url?: string;
    geometry: { coordinates: [number, number] };
    creator?: { username?: string };
  }[];
};

const mapillaryCandidates = (json: MapillaryImages): Candidate[] =>
  (json.data ?? []).flatMap((image) => {
    if (!image.thumb_2048_url) return [];
    const [lon, lat] = image.geometry.coordinates;
    return [
      {
        lat,
        lon,
        id: image.id,
        pano: image.is_pano ?? false,
        imageUrl: image.thumb_2048_url,
        credit: image.creator?.username ?? "a Mapillary contributor",
        license: "CC-BY-SA-4.0",
      },
    ];
  });

/** Everything Mapillary detected in these photos, as detection values. */
export const mapillaryDetections = async (
  ids: string[],
  token: string,
): Promise<string[]> => {
  const lists = await Promise.all(
    ids.map(async (id) => {
      const url = new URL(`https://graph.mapillary.com/${id}/detections`);
      url.searchParams.set("access_token", token);
      url.searchParams.set("fields", "value");
      const json = await fetchJson<{ data?: { value: string }[] }>(
        url.toString(),
      );
      return (json?.data ?? []).map((detection) => detection.value);
    }),
  );
  return lists.flat();
};

/**
 * Photos this close to one already picked show the same view again - three of
 * one intersection from a car creeping forward.
 */
const MIN_SPACING_KM = 0.04;

/**
 * The photos nearest the chosen one that are each at least MIN_SPACING_KM
 * from every photo already picked, to fill out a round of flat photos.
 */
export const neighboursOf = (
  chosen: Candidate,
  others: Candidate[],
  count = 2,
): Candidate[] => {
  const picked: Candidate[] = [chosen];
  const byDistance = others
    .filter((candidate) => candidate.imageUrl !== chosen.imageUrl)
    .sort((a, b) => distanceKm(a, chosen) - distanceKm(b, chosen));
  for (const candidate of byDistance) {
    if (picked.length > count) break;
    if (picked.every((other) => distanceKm(candidate, other) >= MIN_SPACING_KM))
      picked.push(candidate);
  }
  return picked.slice(1);
};

/** The photos a round around `chosen` would show: a panorama alone, else it and two neighbours. */
const shownWith = (chosen: Candidate, others: Candidate[]): Candidate[] =>
  chosen.pano ? [chosen] : [chosen, ...neighboursOf(chosen, others)];

const download = async (url: string): Promise<Buffer | null> => {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  return response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
};

const reencode = (image: Sharp) =>
  image
    .resize({ width: PHOTO_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

/**
 * Dashcams print a strip along the bottom of every frame, and sometimes the
 * top - the time, the camera's name, and on some the latitude and longitude.
 * A flat photo loses this much of each edge so none of that reaches a round.
 */
const TRIM_TOP = 0.04;
const TRIM_BOTTOM = 0.07;

/**
 * A 360° panorama comes as one stretched 2:1 image; it is cut into three
 * views a third of the way round from each other, so a round shows the
 * street in three directions. Anything else is used whole, less its edges.
 */
export const viewsOf = async (original: Buffer): Promise<Buffer[]> => {
  const { width = 0, height = 0 } = await sharp(original).metadata();
  if (!width || !height) return [];
  if (width / height < 1.9) {
    const top = Math.round(height * TRIM_TOP);
    const kept = height - top - Math.round(height * TRIM_BOTTOM);
    return [
      await reencode(
        sharp(original).extract({ left: 0, top, width, height: kept }),
      ),
    ];
  }

  const viewWidth = Math.round(width / 4);
  const top = Math.round(height * 0.3);
  const viewHeight = Math.round(height * 0.4);
  return Promise.all(
    [0.04, 0.37, 0.7].map((start) =>
      reencode(
        sharp(original).extract({
          left: Math.round(width * start),
          top,
          width: viewWidth,
          height: viewHeight,
        }),
      ),
    ),
  );
};

/** Three photos for the round: the chosen one's views, or its nearest neighbours. */
const photosFor = async (
  chosen: Candidate,
  others: Candidate[],
): Promise<Buffer[]> => {
  const first = await download(chosen.imageUrl);
  if (!first) return [];
  const views = await viewsOf(first);
  if (views.length >= 3) return views;

  for (const neighbour of neighboursOf(chosen, others)) {
    const image = await download(neighbour.imageUrl);
    if (image) views.push(...(await viewsOf(image)).slice(0, 1));
  }
  return views;
};

/** How far from the answer a town's other photos are looked for, in km: a city's box can reach out to islands. */
const SPREAD_KM = 8;
/** A town's photos are at least this far from each other, in km. */
const MIN_APART_KM = 0.5;
/** Spots tried for each of a town's other photos. */
const SPOTS_PER_PHOTO = 10;
/** Photos one spot is scored on before moving on. */
const SCORED_PER_SPOT = 3;
/**
 * The least one photo of a town round must give away by itself: a sign or
 * two. Three photos at this clear MIN_CLUES with room to spare.
 */
export const MIN_PHOTO_CLUES = 2;
/** A town round's photos: the answer's and two more. */
const SPREAD_PHOTOS = 2;

/** `box` cut down to SPREAD_KM around `centre`. */
export const spreadBox = (centre: LatLon, box?: Box): Box => {
  const dLat = SPREAD_KM / 111;
  const dLon = SPREAD_KM / (111 * Math.cos((centre.lat * Math.PI) / 180));
  return {
    south: Math.max(box?.south ?? -90, centre.lat - dLat),
    north: Math.min(box?.north ?? 90, centre.lat + dLat),
    west: Math.max(box?.west ?? -180, centre.lon - dLon),
    east: Math.min(box?.east ?? 180, centre.lon + dLon),
  };
};

/** One view per photo: a flat photo whole, a panorama's first view. */
const firstViews = async (photos: Candidate[]): Promise<Buffer[]> => {
  const views: Buffer[] = [];
  for (const photo of photos) {
    const image = await download(photo.imageUrl);
    const [view] = image ? await viewsOf(image) : [];
    if (view) views.push(view);
  }
  return views;
};

/**
 * Two more photos from inside the chosen photo's town, each at least
 * MIN_APART_KM from the others and with clues of its own, or null if the town
 * has none to give in a few tries. Spots are picked anywhere in the town's
 * box, and a photo counts only if Nominatim puts it in the same town: a box
 * holds bits of its neighbours too.
 */
const spreadAcross = async (
  chosen: Candidate,
  token: string,
  random: () => number,
): Promise<{ spread: Candidate[]; found: string[] } | null> => {
  const town = await townOf(chosen).catch(() => null);
  const city = town?.place.city;
  if (!city) return null;
  const box = spreadBox(chosen, town.box);
  const picked: Candidate[] = [chosen];
  const found: string[] = [];
  for (let photo = 0; photo < SPREAD_PHOTOS; photo++) {
    let added = false;
    for (let spot = 0; spot < SPOTS_PER_PHOTO && !added; spot++) {
      const near = (
        await mapillaryNear(
          {
            lat: box.south + random() * (box.north - box.south),
            lon: box.west + random() * (box.east - box.west),
          },
          token,
        )
      ).filter((candidate) =>
        picked.every((other) => distanceKm(candidate, other) >= MIN_APART_KM),
      );
      let best: {
        candidate: Candidate;
        found: string[];
        score: number;
      } | null = null;
      for (const candidate of [...near]
        .sort(() => random() - 0.5)
        .slice(0, SCORED_PER_SPOT)) {
        if (!candidate.id) continue;
        const seen = await mapillaryDetections([candidate.id], token);
        const score = clueScore(seen);
        if (!best || score > best.score)
          best = { candidate, found: seen, score };
      }
      if (!best || best.score < MIN_PHOTO_CLUES) continue;
      const there = await townOf(best.candidate).catch(() => null);
      if (there?.place.city !== city) continue;
      picked.push(best.candidate);
      found.push(...best.found);
      added = true;
    }
    if (!added) return null;
  }
  return { spread: picked.slice(1), found };
};

/**
 * A round of the chosen photo and two more from its town, if the chosen photo
 * has clues enough of its own and the town has photos to give.
 */
const spreadRound = async (
  chosen: Candidate,
  token: string,
  random: () => number,
): Promise<Omit<Pick, "candidates" | "near"> | null> => {
  if (!chosen.id) return null;
  const own = await mapillaryDetections([chosen.id], token);
  if (clueScore(own) < MIN_PHOTO_CLUES) return null;
  const town = await spreadAcross(chosen, token, random);
  if (!town) return null;
  const found = [...own, ...town.found];
  return {
    chosen,
    spread: town.spread,
    clues: { score: clueScore(found), found },
  };
};

type Pick = {
  chosen: Candidate;
  candidates: Candidate[];
  /** Photos from elsewhere in the town, shown after the chosen one. */
  spread?: Candidate[];
  near: string;
  clues?: GeoRound["clues"];
};

/**
 * Finds a spot with photos, trying a handful of towns before giving up. With
 * Mapillary, a spot is used only if its photos clear MIN_CLUES; if none does
 * in time, the best seen is used rather than nothing.
 */
export const findRound = async (
  random = Math.random,
): Promise<GeoRound | null> => {
  const token = process.env.MAPILLARY_TOKEN;
  const source = token ? "Mapillary" : "Panoramax";
  let best: Pick | null = null;

  const roundFrom = async (pick: Pick): Promise<GeoRound | null> => {
    const photos = pick.spread
      ? await firstViews([pick.chosen, ...pick.spread])
      : await photosFor(pick.chosen, pick.candidates);
    if (photos.length === 0) return null;
    const credits = [
      ...new Set([pick.chosen, ...(pick.spread ?? [])].map((c) => c.credit)),
    ];
    return {
      answer: { lat: pick.chosen.lat, lon: pick.chosen.lon },
      near: pick.near,
      photos,
      credit: credits.join(", "),
      license: pick.chosen.license,
      source,
      clues: pick.clues,
    };
  };

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const place = PLACES[Math.floor(random() * PLACES.length)];
    const spot = {
      lat: place.lat + (random() * 2 - 1) * SCATTER,
      lon: place.lon + (random() * 2 - 1) * SCATTER,
    };
    const candidates = token
      ? await mapillaryNear(spot, token)
      : await panoramaxNear(spot);
    if (candidates.length === 0) continue;

    if (!token) {
      const chosen = candidates[Math.floor(random() * candidates.length)];
      const round = await roundFrom({ chosen, candidates, near: place.name });
      if (round) return round;
      continue;
    }

    const tries = [...candidates]
      .sort(() => random() - 0.5)
      .slice(0, TRIES_PER_SPOT);
    for (const chosen of tries) {
      const spread = await spreadRound(chosen, token, random);
      if (spread) {
        const round = await roundFrom({
          ...spread,
          candidates,
          near: place.name,
        });
        if (round) return round;
      }
      const shown = shownWith(chosen, candidates).flatMap(
        (candidate) => candidate.id ?? [],
      );
      const found = await mapillaryDetections(shown, token);
      const score = clueScore(found);
      const pick: Pick = {
        chosen,
        candidates,
        near: place.name,
        clues: { score, found },
      };
      if (!best || score > best.clues!.score) best = pick;
      if (score < MIN_CLUES) continue;
      const round = await roundFrom(pick);
      if (round) return round;
    }
  }

  return best ? roundFrom(best) : null;
};
