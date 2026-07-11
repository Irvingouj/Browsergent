// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// GitHub Pages serves the gh-pages branch at the custom domain.
// Set site so sitemaps/absolute URLs resolve correctly once CNAME is wired.
export default defineConfig({
  site: "https://browsergent.com",
  base: "/",
  // Prefer trailing slashes so canonicals match GitHub Pages redirects
  // (/docs → /docs/) and the generated sitemap URLs stay consistent.
  trailingSlash: "always",
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/404"),
      changefreq: "weekly",
      priority: 0.7,
      lastmod: new Date(),
      serialize(item) {
        // Homepage + download get a slight priority bump.
        if (item.url === "https://browsergent.com/") {
          item.priority = 1.0;
          item.changefreq = "weekly";
        } else if (item.url.includes("/download")) {
          item.priority = 0.9;
        } else if (item.url.includes("/docs")) {
          item.priority = 0.85;
        } else if (item.url.includes("/faq") || item.url.includes("/use-cases")) {
          item.priority = 0.8;
        }
        return item;
      },
    }),
  ],
});
