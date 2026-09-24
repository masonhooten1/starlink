import { describe, expect, it } from "vitest";
import { WEDGE } from "../config";
import { defaultWedgeAzimuth, destination, wedgeSectorGeoJSON } from "./geo";

const EARTH_R = 6_371_000;
const DEG = 180 / Math.PI; // an arc of d metres spans (d / EARTH_R) · DEG degrees

// Independent inverse problem: initial bearing from A to B, 0 = north,
// clockwise, in degrees. Verifies the forward math instead of mirroring it.
function bearingTo(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const p1 = r(lat1);
  const p2 = r(lat2);
  const dl = r(lng2 - lng1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Independent haversine great-circle distance in metres.
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dp = r(lat2 - lat1);
  const dl = r(lng2 - lng1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

describe("defaultWedgeAzimuth", () => {
  it("defaults the equator to north (the >= 0 boundary)", () => {
    expect(defaultWedgeAzimuth(0)).toBe(0);
  });

  it("defaults the northern hemisphere to north (0°)", () => {
    expect(defaultWedgeAzimuth(0.0001)).toBe(0);
    expect(defaultWedgeAzimuth(52.44)).toBe(0);
    expect(defaultWedgeAzimuth(89.9)).toBe(0);
  });

  it("defaults the southern hemisphere to south (180°)", () => {
    expect(defaultWedgeAzimuth(-0.0001)).toBe(180);
    expect(defaultWedgeAzimuth(-33.9)).toBe(180);
    expect(defaultWedgeAzimuth(-89.9)).toBe(180);
  });
});

describe("destination", () => {
  it("steps 1 m due north from the equator", () => {
    const [lat, lng] = destination(0, 0, 0, 1);
    expect(lat).toBeCloseTo((1 / EARTH_R) * DEG, 9);
    expect(lng).toBeCloseTo(0, 12);
  });

  it("travels due east along the equator by one Earth radius", () => {
    const [lat, lng] = destination(0, 0, 90, EARTH_R);
    expect(lat).toBeCloseTo(0, 9);
    expect(lng).toBeCloseTo(DEG, 10); // 1 rad east = 57.2958…°
  });

  it("wraps longitudes across the antimeridian into [-180, 180)", () => {
    const stepDeg = (20_000 / EARTH_R) * DEG; // 20 km east along the equator
    const [lat, lng] = destination(0, 179.9999, 90, 20_000);
    expect(lat).toBeCloseTo(0, 9);
    expect(lng).toBeLessThan(0); // crossed the antimeridian
    expect(lng).toBeCloseTo(179.9999 + stepDeg - 360, 6);
    expect(Math.abs(lng)).toBeLessThanOrEqual(180);
  });

  it("round-trips: the inverse bearing and distance land back on the start", () => {
    const [lat2, lng2] = destination(42.44, -76.5, 137, 150);
    expect(bearingTo(42.44, -76.5, lat2, lng2)).toBeCloseTo(137, 3);
    expect(distanceM(42.44, -76.5, lat2, lng2)).toBeCloseTo(150, 3);

    const [backLat, backLng] = destination(lat2, lng2, (137 + 180) % 360, 150);
    expect(backLat).toBeCloseTo(42.44, 6);
    expect(backLng).toBeCloseTo(-76.5, 6);
  });

  it("stays finite at the poles", () => {
    for (const [lat, lng, bearing] of [
      [90, 0, 0],
      [-90, 0, 180],
    ] as const) {
      const [pLat, pLng] = destination(lat, lng, bearing, 1000);
      expect(Number.isFinite(pLat)).toBe(true);
      expect(Number.isFinite(pLng)).toBe(true);
      expect(Math.abs(pLat)).toBeLessThanOrEqual(90);
    }
  });
});

describe("wedgeSectorGeoJSON", () => {
  const pin: [number, number] = [-76.5, 42.44]; // GeoJSON [lng, lat]

  it("is a GeoJSON Polygon with one ring that closes at the pin", () => {
    const wedge = wedgeSectorGeoJSON(42.44, -76.5, 0);
    expect(wedge.type).toBe("Polygon");
    expect(wedge.coordinates).toHaveLength(1);
    const ring = wedge.coordinates[0];
    expect(ring[0]).toEqual(pin);
    expect(ring[ring.length - 1]).toEqual(pin); // pie slice closed at the dish
    expect(ring).toHaveLength(24 + 3); // pin + 25 arc points + closing pin
  });

  it("keeps every arc point at the requested radius from the pin", () => {
    const ring = wedgeSectorGeoJSON(42.44, -76.5, 0, WEDGE.spreadDeg, 60).coordinates[0];
    for (let i = 1; i < ring.length - 1; i++) {
      expect(distanceM(42.44, -76.5, ring[i][1], ring[i][0])).toBeCloseTo(60, 2);
    }
  });

  it("spans the default 100° wedge centred on the azimuth", () => {
    const ring = wedgeSectorGeoJSON(42.44, -76.5, 0).coordinates[0];
    const first = bearingTo(42.44, -76.5, ring[1][1], ring[1][0]);
    const mid = bearingTo(42.44, -76.5, ring[13][1], ring[13][0]);
    const last = bearingTo(42.44, -76.5, ring[25][1], ring[25][0]);
    expect(first).toBeCloseTo(310, 3); // 0° − 50°
    expect(mid).toBeCloseTo(0, 3); // due north at the sector centre
    expect(last).toBeCloseTo(50, 3); // 0° + 50°
    expect((last - first + 360) % 360).toBeCloseTo(WEDGE.spreadDeg, 3);
  });

  it("honours an explicit spread and azimuth", () => {
    const ring = wedgeSectorGeoJSON(42.44, -76.5, 180, 60).coordinates[0];
    const first = bearingTo(42.44, -76.5, ring[1][1], ring[1][0]);
    const last = bearingTo(42.44, -76.5, ring[ring.length - 2][1], ring[ring.length - 2][0]);
    expect(first).toBeCloseTo(150, 3); // 180° − 30°
    expect(last).toBeCloseTo(210, 3); // 180° + 30°
    expect((last - first + 360) % 360).toBeCloseTo(60, 3);
  });

  it("treats azimuth 360° as 0° and -50° as 310°", () => {
    const base = wedgeSectorGeoJSON(42.44, -76.5, 0).coordinates[0];
    const wrapped = wedgeSectorGeoJSON(42.44, -76.5, 360).coordinates[0];
    for (let i = 0; i < base.length; i++) {
      expect(wrapped[i][0]).toBeCloseTo(base[i][0], 9);
      expect(wrapped[i][1]).toBeCloseTo(base[i][1], 9);
    }

    const negative = wedgeSectorGeoJSON(42.44, -76.5, -50).coordinates[0];
    const positive = wedgeSectorGeoJSON(42.44, -76.5, 310).coordinates[0];
    for (let i = 0; i < negative.length; i++) {
      expect(negative[i][0]).toBeCloseTo(positive[i][0], 9);
      expect(negative[i][1]).toBeCloseTo(positive[i][1], 9);
    }
  });

  it("normalizes every longitude near the antimeridian into [-180, 180)", () => {
    const ring = wedgeSectorGeoJSON(0, 179.9999, 90).coordinates[0];
    for (const [lng, lat] of ring) {
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
    expect(ring.some(([lng]) => lng < 0)).toBe(true); // the east arm wrapped
  });
});
