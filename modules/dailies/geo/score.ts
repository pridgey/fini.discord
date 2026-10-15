/** Distance on the globe, which the closeness bonus and the reveal use; see `judge.ts`. */

export type LatLon = { lat: number; lon: number };

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres. */
export const distanceKm = (a: LatLon, b: LatLon): number => {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** "43 km", "1,204 km", "850 m". */
export const formatDistance = (km: number): string =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km).toLocaleString("en-US")} km`;
