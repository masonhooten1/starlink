// Generates the social share image (public/og.png, 1200x630) from an inline
// SVG template — the site's one sanctioned raster. Output is committed, so
// this only needs re-running when the artwork or wording changes: `npm run og`.
import sharp from "sharp";

const W = 1200;
const H = 630;

// Palette mirrors the design tokens in src/styles/global.css.
const NIGHT = "#101b2b";
const GROUND = "#0d1c2c";
const SKY = "#7fd3ff";
const ACCENT = "#1d5fd6";
const MUTED = "#9fb6cc";
const DIM = "#6f8aa5";

// Wedge apex sits at the dish on the roof peak (1000,330) and opens up and to
// the left (~100° spread), clear of the text block on the left side.
const svg = `<svg width="${W}" height="${H}" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${NIGHT}"/>
  <path d="M200 560 Q650 140 1160 480" fill="none" stroke="#2c3f57" stroke-width="3" stroke-dasharray="6 14"/>
  <path d="M1000 330 L560 90 A505 505 0 0 1 1180 100 Z"
        fill="${ACCENT}" opacity="0.22" stroke="${SKY}" stroke-width="4"/>
  <text x="760" y="215" font-family="DejaVu Sans, sans-serif" font-size="30" fill="${SKY}">100° open sky</text>
  <g transform="translate(820 140)" stroke="${SKY}" stroke-width="3" fill="none">
    <rect x="-42" y="-7" width="26" height="14" rx="3"/>
    <rect x="16" y="-7" width="26" height="14" rx="3"/>
    <circle r="7" fill="${SKY}" stroke="none"/>
  </g>
  <path d="M0 500 H1200 V630 H0 Z" fill="${GROUND}"/>
  <g fill="#1d5245">
    <path d="M170 500 L170 360 L130 440 L152 432 L118 500 Z"/>
    <rect x="160" y="490" width="20" height="14" fill="#152e3d"/>
    <path d="M255 500 L255 420 L227 475 L243 469 L219 500 Z"/>
    <rect x="248" y="492" width="16" height="12" fill="#152e3d"/>
  </g>
  <rect x="890" y="400" width="260" height="100" fill="#1c2d40"/>
  <path d="M870 402 L1000 330 L1150 402 Z" fill="#2c3f57"/>
  <rect x="925" y="430" width="36" height="36" rx="4" fill="#f8c667"/>
  <rect x="1000" y="430" width="36" height="36" rx="4" fill="#f8c667"/>
  <ellipse cx="1000" cy="322" rx="26" ry="15" transform="rotate(-40 1000 322)" fill="#e8eef4"/>
  <text x="80" y="310" font-family="DejaVu Sans, sans-serif" font-size="88" font-weight="bold" fill="#ffffff">DishSpotter</text>
  <text x="80" y="378" font-family="DejaVu Sans, sans-serif" font-size="40" fill="${MUTED}">Plan your Starlink dish placement</text>
  <text x="80" y="582" font-family="DejaVu Sans, sans-serif" font-size="26" fill="${DIM}">Independent planning aid — check the sky before you order</text>
</svg>`;

const out = new URL("../public/og.png", import.meta.url).pathname;
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
console.log(`wrote ${out} (${W}x${H})`);
