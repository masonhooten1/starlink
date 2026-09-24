import { describe, expect, it } from "vitest";
import { decodePlan, encodePlan, type PlanState } from "./shareState";

describe("encodePlan", () => {
  it("emits the documented ?lat=&lng=&az= shape at 6 decimals", () => {
    expect(encodePlan({ lat: 42.44, lng: -76.5, az: 0 })).toBe(
      "?lat=42.440000&lng=-76.500000&az=0",
    );
  });

  it("wraps azimuth past 360° and below 0°", () => {
    expect(encodePlan({ lat: 0, lng: 0, az: 370 })).toBe("?lat=0.000000&lng=0.000000&az=10");
    expect(encodePlan({ lat: 0, lng: 0, az: -10 })).toBe("?lat=0.000000&lng=0.000000&az=350");
  });

  it("rounds fractional azimuth to whole degrees", () => {
    expect(encodePlan({ lat: 0, lng: 0, az: 359.6 })).toBe("?lat=0.000000&lng=0.000000&az=0");
    expect(encodePlan({ lat: 0, lng: 0, az: 44.6 })).toBe("?lat=0.000000&lng=0.000000&az=45");
  });
});

describe("decodePlan round-trip", () => {
  const plans: PlanState[] = [
    { lat: 42.44, lng: -76.5, az: 317 },
    { lat: 0, lng: 0, az: 0 },
    { lat: -33.9, lng: 18.4, az: 180 },
    { lat: 89.9, lng: -179.9, az: 359 },
  ];

  it("restores the exact plan that was encoded", () => {
    for (const plan of plans) {
      expect(decodePlan(new URLSearchParams(encodePlan(plan)))).toEqual(plan);
    }
  });

  it("survives a full share-URL trip", () => {
    for (const plan of plans) {
      const url = new URL(`https://example.com/planner/${encodePlan(plan)}`);
      expect(decodePlan(url.searchParams)).toEqual(plan);
    }
  });

  it("keeps sub-decimal inputs within ~0.1 m of the original", () => {
    const decoded = decodePlan(
      new URLSearchParams(encodePlan({ lat: 42.123456789, lng: -76.987654321, az: 123 })),
    );
    expect(decoded).not.toBeNull();
    expect(decoded!.lat).toBeCloseTo(42.123456789, 6);
    expect(decoded!.lng).toBeCloseTo(-76.987654321, 6);
    expect(decoded!.az).toBe(123);
  });
});

describe("decodePlan rejects absent and nonsensical coordinates", () => {
  it("returns null when lat or lng is missing entirely", () => {
    expect(decodePlan(new URLSearchParams())).toBeNull();
    expect(decodePlan(new URLSearchParams("lng=10&az=5"))).toBeNull();
    expect(decodePlan(new URLSearchParams("lat=10"))).toBeNull();
  });

  it("returns null for unparseable or empty values", () => {
    expect(decodePlan(new URLSearchParams("lat=abc&lng=0"))).toBeNull();
    expect(decodePlan(new URLSearchParams("lat=0&lng=abc"))).toBeNull();
    expect(decodePlan(new URLSearchParams("lat=&lng=0"))).toBeNull();
    expect(decodePlan(new URLSearchParams("lat=0&lng=%20"))).toBeNull();
  });

  it("returns null for out-of-range coordinates", () => {
    expect(decodePlan(new URLSearchParams("lat=90.5&lng=0"))).toBeNull();
    expect(decodePlan(new URLSearchParams("lat=-90.0001&lng=0"))).toBeNull();
    expect(decodePlan(new URLSearchParams("lat=0&lng=180.5"))).toBeNull();
    expect(decodePlan(new URLSearchParams("lat=0&lng=-180.000001"))).toBeNull();
  });

  it("accepts the exact range boundaries", () => {
    expect(decodePlan(new URLSearchParams("lat=90&lng=180"))).toEqual({ lat: 90, lng: 180, az: 0 });
    expect(decodePlan(new URLSearchParams("lat=-90&lng=-180&az=12"))).toEqual({
      lat: -90,
      lng: -180,
      az: 12,
    });
  });
});

describe("decodePlan azimuth handling", () => {
  it("falls back to 0° when az is absent, empty, or unparseable", () => {
    expect(decodePlan(new URLSearchParams("lat=10&lng=20"))!.az).toBe(0);
    expect(decodePlan(new URLSearchParams("lat=10&lng=20&az="))!.az).toBe(0);
    expect(decodePlan(new URLSearchParams("lat=10&lng=20&az=abc"))!.az).toBe(0);
  });

  it("wraps azimuth into [0, 360)", () => {
    expect(decodePlan(new URLSearchParams("lat=10&lng=20&az=-90"))!.az).toBe(270);
    expect(decodePlan(new URLSearchParams("lat=10&lng=20&az=720"))!.az).toBe(0);
    expect(decodePlan(new URLSearchParams("lat=10&lng=20&az=450.7"))!.az).toBe(91);
    expect(decodePlan(new URLSearchParams("lat=10&lng=20&az=360"))!.az).toBe(0);
  });

  it("is stable through decode → encode → decode (within 6-decimal quantization)", () => {
    const first = decodePlan(new URLSearchParams("lat=10.1234567&lng=20.9876543&az=450.7"))!;
    expect(first.az).toBe(91);
    // Encoding quantizes lat/lng to 6 decimals, so the second decode matches
    // only to that precision — but after one quantization pass it is exact.
    const second = decodePlan(new URLSearchParams(encodePlan(first)))!;
    expect(second.az).toBe(first.az);
    expect(second.lat).toBeCloseTo(first.lat, 6);
    expect(second.lng).toBeCloseTo(first.lng, 6);
    expect(decodePlan(new URLSearchParams(encodePlan(second)))).toEqual(second);
  });
});
