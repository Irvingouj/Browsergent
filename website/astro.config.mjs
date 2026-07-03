// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// GitHub Pages serves the gh-pages branch at the custom domain.
// Set site so sitemaps/absolute URLs resolve correctly once CNAME is wired.
export default defineConfig({
  site: "https://browsergent.com",
  base: "/",
  trailingSlash: "ignore",
  integrations: [sitemap()],
});
