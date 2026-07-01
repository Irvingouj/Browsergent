// Single source of truth for site-wide metadata and links.
// The repo is Irvingouj/Browsergent; release assets are published by
// .github/workflows/release.yml as browsergent-<version>.zip and .crx.
export const SITE = {
  name: "Browsergent",
  tagline: "Claude Code for the browser",
  description:
    "An AI agent that lives in a Chrome side panel, sees web pages, and acts on them autonomously. Type a task in plain English — it reasons, generates JavaScript, runs it against the page, and iterates until done.",
  domain: "browsergent.com",
  url: "https://browsergent.com",
  // Latest released version. Bump when a new release ships; the download
  // page falls back to the GitHub releases index if you leave this stale.
  latestVersion: "0.3.2",
  repo: "https://github.com/Irvingouj/Browsergent",
  issues: "https://github.com/Irvingouj/Browsergent/issues",
  releases: "https://github.com/Irvingouj/Browsergent/releases",
} as const;

// Ponies: construct the canonical asset URLs from SITE so there's one place
// to bump the version. If a tag ever diverges from the version string, edit
// the tag segment directly in the URL template below.
const v = SITE.latestVersion;
const tag = `v${v}`;
export const DOWNLOADS = {
  // Source zip built by the release workflow.
  zip: `${SITE.releases}/download/${tag}/browsergent-${v}.zip`,
  // Signed CRX for drag-and-drop install.
  crx: `${SITE.releases}/download/${tag}/browsergent-${v}.crx`,
  // Latest release page (version-agnostic fallback).
  latestRelease: `${SITE.releases}/latest`,
} as const;

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "Docs" },
  { href: "/download", label: "Download" },
] as const;
