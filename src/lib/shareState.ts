/**
 * The planner's full state lives in the URL (?lat=…&lng=…&az=…) so any
 * placement is restorable and shareable. Encoding keeps 6 decimals
 * (~0.1 m at ground level) — far below the accuracy that matters for
 * placement planning — and azimuth wraps into [0, 360).
 */

export interface PlanState {
  lat: number;
  lng: number;
  az: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Wrap any degree value into [0, 360) — -90 and 270 are the same bearing. */
const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * Parse a URL param as a finite number. Absent, empty, and non-numeric
 * values all mean "no value" — null, never NaN, and never a silent 0.
 */
function numberParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Encode a plan into search params (leading `?` included); safe to share. */
export function encodePlan(s: PlanState): string {
  const p = new URLSearchParams({
    lat: s.lat.toFixed(6),
    lng: s.lng.toFixed(6),
    az: String(wrap360(Math.round(s.az))),
  });
  return `?${p.toString()}`;
}

/**
 * Decode and clamp. Returns null for absent or nonsensical coordinates
 * (missing, unparseable, or out of range). Azimuth falls back to 0 when
 * missing or unparseable, and is rounded to whole degrees and wrapped into
 * [0, 360) — matching the encoder, so decode(encode(decode(x))) is stable.
 * The clamps on lat/lng are a postcondition: the returned plan is always in
 * range, whatever future edits do to the range guards above.
 */
export function decodePlan(params: URLSearchParams): PlanState | null {
  const lat = numberParam(params, "lat");
  const lng = numberParam(params, "lng");
  if (lat === null || lng === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    lat: clamp(lat, -90, 90),
    lng: clamp(lng, -180, 180),
    az: wrap360(Math.round(numberParam(params, "az") ?? 0)),
  };
}
