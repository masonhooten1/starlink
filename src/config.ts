// Single source of truth for product constants. Renaming the site or
// re-pointing the referral link, tile provider, or geocoder costs one edit here.
export const SITE = {
  name: "DishSpotter", // working title — rename in one place
  url: "https://masonhooten1.github.io/starlink",
  referralUrl: "https://starlink.com?referral=RC-DF-13159898-39822-14",
  disclaimer: "Independent planning aid — not affiliated with SpaceX or Starlink.",
} as const;

// Esri World Imagery — no API key. Attribution is required by the provider.
export const TILE = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  maxZoom: 19,
} as const;

export const GEOCODER = {
  endpoint: "https://nominatim.openstreetmap.org/search",
  minDelayMs: 1100, // stay inside Nominatim's 1 req/s usage policy
} as const;

export const WEDGE = { spreadDeg: 100, ringsM: [5, 10, 20] } as const;
