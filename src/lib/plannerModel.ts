/**
 * Pure planner logic that sits on top of the shared geometry core (geo.ts)
 * and share state (shareState.ts): bearing and coordinate formatting,
 * hemisphere-aware guidance copy, Nominatim URL construction and result
 * parsing, and the rate-limit gate.
 *
 * The Leaflet controller in src/scripts/planner/main.ts wires these to the
 * DOM; every function here is covered by plannerModel.test.ts.
 */

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Wrap any degree value into [0, 360) — -1° and 359° are the same bearing. */
export function wrapDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Nearest of the eight compass points for a bearing (0 = north). */
export function compassPoint(azimuthDeg: number): string {
  const index = Math.round(wrapDegrees(azimuthDeg) / 45) % 8;
  return COMPASS[index] ?? "N";
}

/** "0° (N)" — bearing plus compass point, as shown in the rotation control. */
export function formatBearing(azimuthDeg: number): string {
  const wrapped = wrapDegrees(Math.round(azimuthDeg));
  return `${wrapped}° (${compassPoint(wrapped)})`;
}

/** "42.44230°N · 76.50190°W" — hemisphere letters, five decimals (~1 m). */
export function formatLatLng(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}°${ns} · ${Math.abs(lng).toFixed(5)}°${ew}`;
}

/**
 * Initial great-circle bearing from (lat1, lng1) to (lat2, lng2), wrapped to
 * [0, 360). Used to read the wedge's azimuth back when the user drags its
 * handle around the pin.
 */
export function initialBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dl = toRad(lng2 - lng1);
  const x = Math.sin(dl) * Math.cos(p2);
  const y = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return wrapDegrees((Math.atan2(x, y) * 180) / Math.PI);
}

/**
 * Guidance copy under the map, hemisphere-aware: names the current wedge
 * direction, the poleward default, and defers to the official app.
 */
export function guidanceLine(lat: number, azimuthDeg: number): string {
  const poleward = lat >= 0 ? "north" : "south";
  return (
    `Wedge points ${compassPoint(azimuthDeg)}. Dishes usually face ${poleward} here — ` +
    "away from the equator — and the Starlink app shows your exact local direction."
  );
}

/** Nominatim search URL for a free-text query (JSON, one result). */
export function nominatimUrl(endpoint: string, query: string): string {
  return `${endpoint}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
}

export interface SearchResult {
  lat: number;
  lng: number;
  label: string;
}

/**
 * First usable Nominatim result, or null when the payload is empty or
 * malformed — the caller then offers the manual-pan fallback. Out-of-range
 * and non-numeric entries are skipped rather than trusted.
 */
export function pickSearchResult(payload: unknown): SearchResult | null {
  if (!Array.isArray(payload)) return null;
  for (const item of payload) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as { lat?: unknown; lon?: unknown; display_name?: unknown };
    const lat = Number(record.lat);
    const lng = Number(record.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    return {
      lat,
      lng,
      label: typeof record.display_name === "string" ? record.display_name : "Unnamed location",
    };
  }
  return null;
}

/**
 * Milliseconds to wait before the next Nominatim request so the session
 * stays inside the geocoder's 1 req/s usage policy; 0 when no wait applies.
 */
export function nextSearchAllowedMs(
  lastSearchAtMs: number | null,
  nowMs: number,
  minDelayMs: number,
): number {
  if (lastSearchAtMs === null) return 0;
  return Math.max(0, minDelayMs - (nowMs - lastSearchAtMs));
}
