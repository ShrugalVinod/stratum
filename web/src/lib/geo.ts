// Small great-circle helpers shared by the live pages (Live sky, Spot a contrail).
import { T } from "../i18n";

export const R_EARTH = 6371;
export const rad = (d: number) => (d * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
export const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const dirName = (bearing: number) => T(DIRS[Math.round(bearing / 45) % 8]);

/** Ground distance (km) and bearing (° from north) from a to b. */
export function distBearing(lat1: number, lon1: number, lat2: number, lon2: number): [number, number] {
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const dl = rad(lon2 - lon1);
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const d = 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return [d, (deg(Math.atan2(y, x)) + 360) % 360];
}

/** The point ``km`` from (lat, lon) along ``bearing`` (flat-earth step; fine below ~300 km). */
export function move(lat: number, lon: number, bearing: number, km: number): [number, number] {
  const dLat = (km / 111.2) * Math.cos(rad(bearing));
  const dLon = ((km / 111.2) * Math.sin(rad(bearing))) / Math.cos(rad(lat));
  return [lat + dLat, lon + dLon];
}
