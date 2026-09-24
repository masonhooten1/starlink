import { describe, expect, it } from "vitest";
import { GEOCODER, SITE, TILE, WEDGE } from "./config";

// Smoke test: the scaffold's constants module carries the exact values the
// product spec locks in. Every CTA and map feature renders from these.
describe("config constants", () => {
  it("carries the referral link that every CTA must render", () => {
    expect(SITE.referralUrl).toBe("https://starlink.com?referral=RC-DF-13159898-39822-14");
  });

  it("names the site and points at the GitHub Pages project URL", () => {
    expect(SITE.name).toBe("DishSpotter");
    expect(SITE.url).toBe("https://masonhooten1.github.io/starlink");
  });

  it("uses the Esri World Imagery tile source with its required attribution", () => {
    expect(TILE.url).toContain("World_Imagery");
    expect(TILE.attribution).toContain("Esri");
    expect(TILE.maxZoom).toBeGreaterThan(0);
  });

  it("defaults the geocoder and wedge to the spec's researched values", () => {
    expect(GEOCODER.endpoint).toContain("nominatim.openstreetmap.org");
    expect(GEOCODER.minDelayMs).toBeGreaterThanOrEqual(1000);
    expect(WEDGE.spreadDeg).toBe(100);
    expect(WEDGE.ringsM).toEqual([5, 10, 20]);
  });
});
