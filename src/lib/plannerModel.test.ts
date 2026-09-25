import { describe, expect, it } from "vitest";
import {
  compassPoint,
  formatBearing,
  formatLatLng,
  guidanceLine,
  initialBearing,
  nextSearchAllowedMs,
  nominatimUrl,
  pickSearchResult,
  wrapDegrees,
} from "./plannerModel";

describe("wrapDegrees", () => {
  it("wraps into [0, 360)", () => {
    expect(wrapDegrees(0)).toBe(0);
    expect(wrapDegrees(361)).toBe(1);
    expect(wrapDegrees(-1)).toBe(359);
    expect(wrapDegrees(720)).toBe(0);
    expect(wrapDegrees(-90)).toBe(270);
  });
});

describe("compassPoint", () => {
  it("names all eight points, clockwise from north", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(45)).toBe("NE");
    expect(compassPoint(90)).toBe("E");
    expect(compassPoint(135)).toBe("SE");
    expect(compassPoint(180)).toBe("S");
    expect(compassPoint(225)).toBe("SW");
    expect(compassPoint(270)).toBe("W");
    expect(compassPoint(315)).toBe("NW");
  });

  it("wraps out-of-range bearings onto the same point", () => {
    expect(compassPoint(360)).toBe("N");
    expect(compassPoint(359)).toBe("N");
    expect(compassPoint(-90)).toBe("W");
  });
});

describe("formatBearing", () => {
  it("shows the bearing with its compass point", () => {
    expect(formatBearing(0)).toBe("0° (N)");
    expect(formatBearing(100.4)).toBe("100° (E)");
  });

  it("wraps before formatting", () => {
    expect(formatBearing(361)).toBe("1° (N)");
    expect(formatBearing(-1)).toBe("359° (N)");
  });
});

describe("formatLatLng", () => {
  it("labels hemispheres with N/S and E/W", () => {
    expect(formatLatLng(42.4423, -76.5019)).toBe("42.44230°N · 76.50190°W");
    expect(formatLatLng(-10.5, 179.9)).toBe("10.50000°S · 179.90000°E");
  });

  it("uses north/east for zero coordinates", () => {
    expect(formatLatLng(0, 0)).toBe("0.00000°N · 0.00000°E");
  });
});

describe("initialBearing", () => {
  it("reads the four cardinal directions", () => {
    expect(initialBearing(0, 0, 1, 0)).toBeCloseTo(0, 0); // north
    expect(initialBearing(0, 0, 0, 1)).toBeCloseTo(90, 0); // east
    expect(initialBearing(0, 0, -1, 0)).toBeCloseTo(180, 0); // south
    expect(initialBearing(0, 0, 0, -1)).toBeCloseTo(270, 0); // west
  });

  it("stays within [0, 360) for off-axis targets", () => {
    const bearing = initialBearing(44.3, -121.6, 44.31, -121.59);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });
});

describe("guidanceLine", () => {
  it("is hemisphere-aware and names the wedge direction", () => {
    const north = guidanceLine(44.3, 0);
    expect(north).toContain("points N");
    expect(north).toContain("face north");
    expect(guidanceLine(-33.9, 180)).toContain("face south");
    expect(guidanceLine(-33.9, 180)).toContain("points S");
  });

  it("defers to the official app", () => {
    expect(guidanceLine(44.3, 90)).toContain("Starlink app");
  });
});

describe("nominatimUrl", () => {
  it("requests JSON, one result, with the encoded query", () => {
    expect(nominatimUrl("https://nominatim.openstreetmap.org/search", "Bend, Oregon")).toBe(
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=Bend%2C%20Oregon",
    );
  });
});

describe("pickSearchResult", () => {
  it("takes the first usable result", () => {
    expect(
      pickSearchResult([{ lat: "42.44", lon: "-76.5", display_name: "Bend, Oregon" }]),
    ).toEqual({
      lat: 42.44,
      lng: -76.5,
      label: "Bend, Oregon",
    });
  });

  it("labels a result without a display name", () => {
    expect(pickSearchResult([{ lat: "5", lon: "5" }])).toEqual({
      lat: 5,
      lng: 5,
      label: "Unnamed location",
    });
  });

  it("returns null for non-arrays, empty arrays, and unusable entries", () => {
    expect(pickSearchResult("nope")).toBeNull();
    expect(pickSearchResult([])).toBeNull();
    expect(pickSearchResult([null, { lat: "x", lon: "1" }])).toBeNull();
  });

  it("skips out-of-range coordinates instead of trusting them", () => {
    expect(pickSearchResult([{ lat: "91", lon: "0" }])).toBeNull();
    expect(pickSearchResult([{ lat: "0", lon: "181" }])).toBeNull();
  });

  it("skips a bad first entry and uses the next", () => {
    expect(
      pickSearchResult([
        { lat: "abc", lon: "1" },
        { lat: "2", lon: "2", display_name: "Second" },
      ]),
    ).toEqual({ lat: 2, lng: 2, label: "Second" });
  });
});

describe("nextSearchAllowedMs", () => {
  it("needs no wait before the first search", () => {
    expect(nextSearchAllowedMs(null, 1000, 1100)).toBe(0);
  });

  it("waits out the remainder of the delay window", () => {
    expect(nextSearchAllowedMs(500, 1000, 1100)).toBe(600);
    expect(nextSearchAllowedMs(0, 1100, 1100)).toBe(0);
  });

  it("needs no wait once the window has passed", () => {
    expect(nextSearchAllowedMs(500, 2000, 1100)).toBe(0);
  });
});
