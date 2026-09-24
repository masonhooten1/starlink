// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// GitHub Pages project site: https://masonhooten1.github.io/starlink
export default defineConfig({
  site: "https://masonhooten1.github.io",
  base: "/starlink",
  output: "static",
  integrations: [sitemap()],
});
