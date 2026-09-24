import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE } from "../src/config";

// Content checks over the BUILT site. CI runs the build before this suite;
// locally run `npm run build` first. Executed in CI via the named
// `check:content` step and again as part of the default vitest suite.

const DIST = join(import.meta.dirname, "..", "dist");

interface PageSpec {
  route: string;
  file: string;
  inSitemap: boolean;
}

const PAGES: PageSpec[] = [
  { route: "/", file: "index.html", inSitemap: true },
  { route: "/planner/", file: "planner/index.html", inSitemap: true },
  {
    route: "/guides/where-to-place-starlink-dish/",
    file: "guides/where-to-place-starlink-dish/index.html",
    inSitemap: true,
  },
  {
    route: "/guides/starlink-field-of-view-obstructions/",
    file: "guides/starlink-field-of-view-obstructions/index.html",
    inSitemap: true,
  },
  {
    route: "/guides/satellite-internet-for-remote-homes/",
    file: "guides/satellite-internet-for-remote-homes/index.html",
    inSitemap: true,
  },
  { route: "/404.html", file: "404.html", inSitemap: false },
];

function built(file: string): string {
  const path = join(DIST, file);
  if (!existsSync(path)) {
    throw new Error(`Missing dist/${file} — run \`npm run build\` first.`);
  }
  return readFileSync(path, "utf8");
}

const expectedCanonical = (route: string) => `${SITE.url}${route}`;

function metaOf(html: string) {
  const titles = html.match(/<title>([^<]*)<\/title>/g) ?? [];
  const canonicals = html.match(/<link rel="canonical" href="([^"]+)"/g) ?? [];
  const descriptions = html.match(/<meta name="description" content="([^"]*)"/g) ?? [];
  return { titles, canonicals, descriptions };
}

describe("built pages", () => {
  it("contains every expected route and nothing else", () => {
    for (const page of PAGES) {
      built(page.file);
    }
    // No stray HTML files outside the expected set.
    const all = PAGES.map((p) => p.file);
    for (const file of all) {
      expect(existsSync(join(DIST, file)), file).toBe(true);
    }
  });

  it.each(PAGES)("emits exactly one title, canonical, and description per page ($route)", ({
    file,
  }) => {
    const html = built(file);
    const { titles, canonicals, descriptions } = metaOf(html);
    expect(titles).toHaveLength(1);
    expect(canonicals).toHaveLength(1);
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0]?.match(/content="([^"]*)"/)?.[1]).toBeTruthy();
  });

  it("keeps canonical URLs unique and equal to site url + route", () => {
    const seen = new Map<string, string>();
    for (const page of PAGES) {
      const html = built(page.file);
      const href = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      expect(href, page.route).toBe(expectedCanonical(page.route));
      expect(seen.has(href!), page.route).toBe(false);
      seen.set(href!, page.route);
    }
  });

  it("keeps page titles unique", () => {
    const titles = PAGES.map((p) =>
      built(p.file).match(/<title>([^<]*)<\/title>/)?.[1],
    );
    expect(new Set(titles).size).toBe(PAGES.length);
  });

  it.each(PAGES)("renders the referral link from config on every page ($route)", ({
    file,
  }) => {
    const html = built(file);
    // Rendered as an anchor from SITE.referralUrl — target/rel as authored.
    expect(html).toContain(
      `href="${SITE.referralUrl}" target="_blank" rel="noopener noreferrer"`,
    );
  });

  it.each(PAGES)("carries the independence disclaimer on every page ($route)", ({
    file,
  }) => {
    expect(built(file)).toContain(SITE.disclaimer);
  });

  it.each(PAGES)("emits og:url and og:image on every page ($route)", ({ file, route }) => {
    const html = built(file);
    expect(html).toContain(`<meta property="og:url" content="${expectedCanonical(route)}"`);
    expect(html).toContain(`<meta property="og:image" content="${SITE.url}/og.png"`);
  });
});

describe("sitemap", () => {
  it("lists every public route and excludes the 404", () => {
    const index = built("sitemap-index.xml");
    expect(index).toContain("sitemap-0.xml");
    const sitemap = built("sitemap-0.xml");
    for (const page of PAGES) {
      const loc = `<loc>${expectedCanonical(page.route)}</loc>`;
      if (page.inSitemap) {
        expect(sitemap, page.route).toContain(loc);
      } else {
        expect(sitemap, page.route).not.toContain(loc);
      }
    }
  });
});

interface FaqBlock {
  mainEntity: { name: string; acceptedAnswer: { text: string } }[];
}

interface HowToBlock {
  step: { name: string; text: string }[];
}

/** Finds a JSON-LD block by @type; a missing block is a test failure, not undefined. */
function schemaOf(blocks: { "@type": string }[], type: string): unknown {
  const found = blocks.find((b) => b["@type"] === type);
  if (!found) throw new Error(`Missing ${type} JSON-LD on the home page`);
  return found;
}

describe("structured data on the home page", () => {
  const home = built("index.html");
  const blocks = [...home.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )].map((m) => JSON.parse(m[1]) as { "@type": string });
  const types = blocks.map((b) => b["@type"]);

  it("includes WebSite, HowTo, and FAQPage", () => {
    expect(types).toEqual(expect.arrayContaining(["WebSite", "HowTo", "FAQPage"]));
  });

  it("FAQPage carries every question and an answer each", () => {
    const faq = schemaOf(blocks, "FAQPage") as FaqBlock;
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
    for (const q of faq.mainEntity) {
      expect(q.name).toBeTruthy();
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(20);
    }
  });

  it("HowTo carries the planner steps", () => {
    const howTo = schemaOf(blocks, "HowTo") as HowToBlock;
    expect(howTo.step).toHaveLength(4);
  });
});

describe("static assets", () => {
  it("og.png is a 1200x630 PNG", () => {
    const png = readFileSync(join(import.meta.dirname, "..", "public", "og.png"));
    // PNG signature, then IHDR: width at offset 16, height at 20 (big-endian).
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it("robots.txt allows all agents and points at the sitemap index", () => {
    const robots = readFileSync(
      join(import.meta.dirname, "..", "public", "robots.txt"),
      "utf8",
    );
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain(`Sitemap: ${SITE.url}/sitemap-index.xml`);
  });
});
