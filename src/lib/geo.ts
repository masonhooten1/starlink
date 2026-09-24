import { WEDGE } from "../config";

/**
 * Spherical geometry for the dish's required open-sky wedge.
 *
 * Bearings are compass azimuths: 0° = north, 90° = east, clockwise.
 * Distances are metres on a spherical Earth — accurate to well under a
 * centimetre at the 5–60 m scales the planner draws.
 */

/** Mean Earth radius in metres (spherical approximation). */
const EARTH_R = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Normalize a longitude to [-180, 180) — antimeridian crossings wrap. */
const normalizeLng = (lng: number): number => ((lng + 540) % 360) - 180;

/** A GeoJSON position: [longitude, latitude]. */
export type GeoJSONPosition = [number, number];

/** A GeoJSON Polygon — the wedge sector, ready for L.geoJSON(). */
export interface WedgePolygon {
  type: "Polygon";
  coordinates: GeoJSONPosition[][];
}

/**
 * Destination point given a start, a bearing (0 = north, clockwise), and a
 * distance in metres. Returns [lat, lng].
 */
export function destination(
  lat: number,
  lng: number,
  bearingDeg: number,
  distM: number,
): [number, number] {
  const br = toRad(bearingDeg);
  const d = distM / EARTH_R;
  const p1 = toRad(lat);
  const l1 = toRad(lng);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2),
    );
  return [toDeg(p2), normalizeLng(toDeg(l2))];
}

/**
 * The dish's required open-sky wedge as a GeoJSON Polygon (Leaflet-ready via
 * L.geoJSON). Positions are [lng, lat] per GeoJSON convention. Azimuth 0 =
 * north, clockwise; the arc starts spreadDeg/2 counter-clockwise of it. The
 * slice always closes at the pin so dragging keeps it anchored. Default
 * spread is WEDGE.spreadDeg — the spec's 100° field of view.
 */
export function wedgeSectorGeoJSON(
  lat: number,
  lng: number,
  azimuthDeg: number,
  spreadDeg: number = WEDGE.spreadDeg,
  radiusM = 60,
  steps = 24,
): WedgePolygon {
  const ring: GeoJSONPosition[] = [[lng, lat]];
  for (let i = 0; i <= steps; i++) {
    const bearing = azimuthDeg - spreadDeg / 2 + (spreadDeg / steps) * i;
    const [pLat, pLng] = destination(lat, lng, bearing, radiusM);
    ring.push([pLng, pLat]); // GeoJSON wants [lng, lat]; destination returns [lat, lng]
  }
  ring.push([lng, lat]); // close the pie slice at the dish location
  return { type: "Polygon", coordinates: [ring] };
}

/**
 * Poleward default: dishes point away from the equator and the geostationary
 * belt — north (0°) for northern-hemisphere sites, south (180°) for southern.
 * The wedge is always user-rotatable; this only sets the starting direction.
 */
export function defaultWedgeAzimuth(lat: number): number {
  return lat >= 0 ? 0 : 180;
}
