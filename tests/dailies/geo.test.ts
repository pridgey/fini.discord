import { afterEach, describe, expect, it, mock } from "bun:test";
import sharp from "sharp";
import { parseCoordinates } from "../../modules/dailies/geo/geocode";
import { clueScore, MIN_CLUES } from "../../modules/dailies/geo/clues";
import { continentOf } from "../../modules/dailies/geo/continents";
import { guessPlace, levelOf, placeFromAddress, type GeocodedGuess, type PlaceInfo } from "../../modules/dailies/geo/geocode";
import { judgeGuess, MAX_PAY, photoMultiplier } from "../../modules/dailies/geo/judge";
import { mapillaryNear, neighboursOf, panoramaxNear, viewsOf, type Candidate } from "../../modules/dailies/geo/imagery";
import { fitZoom, project, renderMap } from "../../modules/dailies/geo/map";
import { distanceKm, formatDistance } from "../../modules/dailies/geo/score";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const KYOTO = { lat: 35.0116, lon: 135.7681 };
const OSAKA = { lat: 34.6937, lon: 135.5023 };

describe("distance", () => {
  it("measures distance over the globe", () => {
    expect(distanceKm(KYOTO, KYOTO)).toBe(0);
    expect(distanceKm(KYOTO, OSAKA)).toBeCloseTo(43, 0);
    // Paris to New York is about 5,837 km.
    expect(distanceKm({ lat: 48.8566, lon: 2.3522 }, { lat: 40.7128, lon: -74.006 })).toBeCloseTo(5837, -1);
    // Across the date line is short, not the long way round.
    expect(distanceKm({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 })).toBeLessThan(112);
  });

  it("states distances the way people say them", () => {
    expect(formatDistance(0.85)).toBe("850 m");
    expect(formatDistance(43.2)).toBe("43 km");
    expect(formatDistance(1204.4)).toBe("1,204 km");
  });
});

describe("reading coordinates", () => {
  it("takes what Google Maps copies, with or without brackets", () => {
    expect(parseCoordinates("35.0037, 135.7788")).toMatchObject({ lat: 35.0037, lon: 135.7788 });
    expect(parseCoordinates("(-33.8688,151.2093)")).toMatchObject({ lat: -33.8688, lon: 151.2093 });
    expect(parseCoordinates("40.7 -74")).toMatchObject({ lat: 40.7, lon: -74 });
  });

  it("leaves place names and impossible points to the place search", () => {
    expect(parseCoordinates("Kyoto")).toBeNull();
    expect(parseCoordinates("Route 66")).toBeNull();
    expect(parseCoordinates("95, 10")).toBeNull();
    expect(parseCoordinates("10, 190")).toBeNull();
  });
});

describe("the map", () => {
  it("projects the world onto Web Mercator tiles", () => {
    expect(project({ lat: 0, lon: 0 }, 0)).toEqual({ x: 128, y: 128 });
    expect(project({ lat: 0, lon: -180 }, 1).x).toBe(0);
    expect(project({ lat: 85.0511, lon: 0 }, 0).y).toBeCloseTo(0, 1);
  });

  it("zooms in close for near pins and out for far ones", () => {
    expect(fitZoom([KYOTO, OSAKA], 800, 480)).toBeGreaterThanOrEqual(9);
    expect(fitZoom([KYOTO, { lat: 48.8566, lon: 2.3522 }], 800, 480)).toBeLessThanOrEqual(3);
  });

  it("draws a map of the requested size, with tiles that fail left as sea", async () => {
    globalThis.fetch = mock(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const png = await renderMap(
      [
        { ...KYOTO, color: "#3b82f6", label: "You" },
        { lat: 64.7, lon: 177.5, color: "#ef4444", label: "Here" },
      ],
      { width: 640, height: 360 },
    );
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([640, 360, "png"]);
  });
});

describe("photos", () => {
  const image = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: "#888888" } })
      .withMetadata({ exif: { IFD0: { Copyright: "secret spot" } } })
      .jpeg()
      .toBuffer();

  it("cuts a 360° panorama into three views and keeps a flat photo whole", async () => {
    const views = await viewsOf(await image(4000, 2000));
    expect(views).toHaveLength(3);
    const flat = await viewsOf(await image(1600, 1200));
    expect(flat).toHaveLength(1);
    expect((await sharp(flat[0]).metadata()).width).toBe(1280);
    // The edges a dashcam prints on are gone: 1200 tall, less 4% and 7%.
    expect((await sharp(flat[0]).metadata()).height).toBe(Math.round((1068 * 1280) / 1600));
  });

  it("strips the metadata that could give the place away", async () => {
    const original = await image(1600, 1200);
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const [view] = await viewsOf(original);
    expect((await sharp(view).metadata()).exif).toBeUndefined();
  });

  it("reads Panoramax's photos, credits and licences", async () => {
    let asked = "";
    globalThis.fetch = mock(async (url: string) => {
      asked = String(url);
      return Response.json({
        features: [
          {
            geometry: { coordinates: [4.83, 45.76] },
            assets: { sd: { href: "https://example.org/sd.jpg" }, hd: { href: "https://example.org/hd.jpg" } },
            providers: [{ name: "ecartip", roles: ["producer"] }],
            properties: { license: "CC-BY-SA-4.0" },
          },
          { geometry: { coordinates: [4.84, 45.77] }, assets: {} },
        ],
      });
    }) as unknown as typeof fetch;

    expect(await panoramaxNear({ lat: 45.76, lon: 4.83 })).toEqual([
      { lat: 45.76, lon: 4.83, imageUrl: "https://example.org/hd.jpg", credit: "ecartip", license: "CC-BY-SA-4.0" },
    ]);
    expect(asked).toContain("bbox=4.82,45.75,4.84,45.77");
  });
});

describe("clues", () => {
  const times = (value: string, count: number) => Array<string>(count).fill(value);

  it("rates writing and traffic signs well above street furniture", () => {
    expect(clueScore([...times("object--sign--store", 4), "information--parking--g1", "regulatory--no-entry--g1"])).toBe(
      2 * 3 + 2 + 1.5,
    );
  });

  it("ignores what tells you nothing, and caps what every street has", () => {
    expect(clueScore(["nature--sky", "construction--flat--road", "object--vehicle--car"])).toBe(0);
    const lampsAndPaint = clueScore([
      ...times("object--street-light", 14),
      ...times("object--support--utility-pole", 9),
      ...times("object--traffic-light--general-upright", 6),
      ...times("marking--continuous--dashed", 39),
      ...times("marking--continuous--solid", 20),
      ...times("marking--discrete--crosswalk-zebra", 4),
    ]);
    // Furniture tops out at 2 and paint at 1, however much there is.
    expect(lampsAndPaint).toBe(3);
    // A path with a few lamp posts has nothing to go on.
    expect(clueScore(times("object--street-light", 7))).toBeLessThan(MIN_CLUES);
  });
});

describe("searching Mapillary", () => {
  const image = { id: "1", is_pano: true, thumb_2048_url: "https://example.org/1.jpg", geometry: { coordinates: [2.35, 48.85] }, creator: { username: "fen" } };

  it("widens a box that came back empty", async () => {
    const boxes: string[] = [];
    globalThis.fetch = mock(async (url: string) => {
      boxes.push(new URL(url).searchParams.get("bbox")!);
      return Response.json({ data: boxes.length === 1 ? [] : [image] });
    }) as unknown as typeof fetch;

    expect(await mapillaryNear({ lat: 48.85, lon: 2.35 }, "token")).toEqual([
      { lat: 48.85, lon: 2.35, id: "1", pano: true, imageUrl: "https://example.org/1.jpg", credit: "fen", license: "CC-BY-SA-4.0" },
    ]);
    expect(boxes).toEqual(["2.349,48.849,2.351,48.851", "2.347,48.847,2.353,48.853"]);
  });

  it("stops at a box Mapillary refuses as too busy", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      return Response.json({ error: { message: "Please reduce the amount of data" } }, { status: 500 });
    }) as unknown as typeof fetch;

    expect(await mapillaryNear({ lat: 48.85, lon: 2.35 }, "token")).toEqual([]);
    expect(calls).toBe(1);
  });
});

describe("photo spacing", () => {
  const at = (id: string, lat: number, lon: number): Candidate => ({
    lat,
    lon,
    id,
    imageUrl: `https://example.org/${id}.jpg`,
    credit: "",
    license: "",
  });

  it("skips photos that would show the same view again", () => {
    const chosen = at("a", 48.85, 2.35);
    // ~11 m, ~22 m, ~55 m and ~110 m north of the chosen photo.
    const others = [at("b", 48.8501, 2.35), at("c", 48.8502, 2.35), at("d", 48.8505, 2.35), at("e", 48.851, 2.35)];
    expect(neighboursOf(chosen, others).map((c) => c.id)).toEqual(["d", "e"]);
  });
});

describe("places", () => {
  it("knows each continent, transcontinental countries included", () => {
    expect(continentOf("fr")).toBe("Europe");
    expect(continentOf("RU")).toBe("Europe");
    expect(continentOf("TR")).toBe("Asia");
    expect(continentOf("EG")).toBe("Africa");
    expect(continentOf("PA")).toBe("North America");
    expect(continentOf("NZ")).toBe("Oceania");
    expect(continentOf("XX")).toBeUndefined();
  });

  it("knows how much a guess named, by the kind of place found", () => {
    expect(levelOf("country")).toBe("country");
    expect(levelOf("state")).toBe("province");
    expect(levelOf("county")).toBe("province");
    // Berlin and Tokyo are cities, though Nominatim ranks them like states.
    expect(levelOf("city")).toBe("city");
    expect(levelOf("railway")).toBe("city");
  });

  it("reads Nominatim's address, whatever a country calls its provinces and towns", () => {
    expect(
      placeFromAddress({
        city: "Kyoto",
        province: "Kyoto Prefecture",
        "ISO3166-2-lvl4": "JP-26",
        country: "Japan",
        country_code: "jp",
      }),
    ).toEqual({ countryCode: "JP", country: "Japan", provinceCode: "JP-26", province: "Kyoto Prefecture", city: "Kyoto" });
    expect(placeFromAddress({ village: "Mercœur", municipality: "Brioude", state: "Auvergne-Rhône-Alpes", country_code: "fr" }).city).toBe(
      "Mercœur",
    );
  });
});

describe("a guess's own town", () => {
  it("is the place itself when Nominatim files a city under another key, as it does Dubai", () => {
    // What the place search returned for "Dubai" on 2026-10-16.
    const dubai = guessPlace({
      name: "Dubai",
      addresstype: "administrative",
      address: {
        administrative: "Dubai",
        state: "Dubai Emirate",
        "ISO3166-2-lvl4": "AE-DU",
        country: "United Arab Emirates",
        country_code: "ae",
      },
    });
    expect(dubai).toMatchObject({ city: "Dubai", provinceCode: "AE-DU", countryCode: "AE" });
    // A country or a province names no town, whatever it's called.
    expect(guessPlace({ name: "Japan", addresstype: "country", address: { country: "Japan", country_code: "jp" } }).city).toBeUndefined();
    // An address that does give a town keeps it.
    expect(guessPlace({ name: "Fushimi-Inari", addresstype: "railway", address: { city: "Kyoto", country_code: "jp" } }).city).toBe("Kyoto");
  });
});

describe("judging a guess", () => {
  const LYON: PlaceInfo = { countryCode: "FR", country: "France", provinceCode: "FR-ARA", province: "Auvergne-Rhône-Alpes", city: "Lyon" };
  const answer = { lat: 45.764, lon: 4.8357, place: LYON };
  const guess = (lat: number, lon: number, place: PlaceInfo, level: GeocodedGuess["level"] = "city"): GeocodedGuess => ({
    lat,
    lon,
    label: "",
    place,
    level,
  });
  const earned = (verdict: ReturnType<typeof judgeGuess>) =>
    verdict.checks.filter((check) => check.outcome === "earned").map((check) => check.label);

  it("pays every check and the full closeness bonus for a guess on the spot", () => {
    const verdict = judgeGuess(guess(45.764, 4.8357, LYON), answer);
    expect(verdict.checks.every((check) => check.outcome === "earned")).toBe(true);
    expect(verdict.bonus).toBe(50);
    expect(verdict.total).toBe(MAX_PAY);
    expect(MAX_PAY).toBe(220);
  });

  it("climbs the ladder until the first miss, and locks the rest", () => {
    const marseille = guess(43.2965, 5.3698, { ...LYON, provinceCode: "FR-PAC", province: "Provence-Alpes-Côte d'Azur", city: "Marseille" });
    const verdict = judgeGuess(marseille, answer);
    expect(earned(verdict)).toEqual(["Northern hemisphere", "Eastern hemisphere", "Europe", "France"]);
    expect(verdict.checks.map((check) => check.outcome).slice(4)).toEqual(["missed", "locked"]);
    expect(verdict.checks[4].note).toBe("you said Provence-Alpes-Côte d'Azur");
    expect(verdict.total).toBe(10 + 10 + 20 + 30);
  });

  it("judges the hemispheres on their own, even after a wrong continent", () => {
    const newYork = guess(40.7128, -74.006, { countryCode: "US", country: "United States", provinceCode: "US-NY", city: "New York" });
    const verdict = judgeGuess(newYork, answer);
    expect(earned(verdict)).toEqual(["Northern hemisphere"]);
    expect(verdict.checks[1]).toMatchObject({ label: "Eastern hemisphere", outcome: "missed" });
    expect(verdict.total).toBe(10);
  });

  it("only pays as far as the guess named", () => {
    // "France" lands in the middle of France - not in Lyon's region, but it never claimed to be.
    const france = guess(46.6, 1.9, { countryCode: "FR", country: "France", provinceCode: "FR-CVL" }, "country");
    const verdict = judgeGuess(france, answer);
    expect(earned(verdict)).toEqual(["Northern hemisphere", "Eastern hemisphere", "Europe", "France"]);
    expect(verdict.checks[4]).toMatchObject({ outcome: "locked", note: "your guess named a country, not a province" });
    expect(verdict.bonus).toBe(0);
  });

  it("counts a town by name, or by being within 10 km of the spot", () => {
    const villeurbanne = guess(45.7719, 4.8902, { ...LYON, city: "Villeurbanne" });
    expect(judgeGuess(villeurbanne, answer).checks.at(-1)?.outcome).toBe("earned");
    const tokyoWard = { lat: 35.684, lon: 139.754, place: { countryCode: "JP", country: "Japan", provinceCode: "JP-13", city: "Chiyoda" } };
    const tokyo = guess(35.6769, 139.7639, { countryCode: "JP", country: "Japan", provinceCode: "JP-13", city: "Tokyo" });
    expect(judgeGuess(tokyo, tokyoWard).checks.at(-1)?.outcome).toBe("earned");
  });

  it("gives the province away in a country that has none", () => {
    const singapore = { lat: 1.3, lon: 103.85, place: { countryCode: "SG", country: "Singapore", city: "Singapore" } };
    const verdict = judgeGuess(guess(1.29, 103.85, { countryCode: "SG", country: "Singapore" }, "country"), singapore);
    expect(verdict.checks[4]).toMatchObject({ outcome: "earned" });
    expect(verdict.checks[5]).toMatchObject({ outcome: "locked" });
  });

  it("pays more when a round has fewer photos", () => {
    expect([3, 4, 2, 1].map(photoMultiplier)).toEqual([1, 1, 1.5, 2]);
  });

  it("shrinks the closeness bonus with distance", () => {
    const bonusAt = (lat: number) => judgeGuess(guess(lat, 4.8357, LYON), answer).bonus;
    const [near, mid, far] = [45.7685, 45.782, 45.82].map(bonusAt);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });
});
