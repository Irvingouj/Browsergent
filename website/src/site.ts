import packageJson from "../../package.json";

export const SITE = {
  name: "Browsergent",
  tagline: "Claude Code for the browser",
  description:
    "An AI agent that lives in a Chrome side panel, sees web pages, and acts on them autonomously. Type a task in plain English — it reasons, generates JavaScript, runs it against the page, and iterates until done.",
  domain: "browsergent.com",
  url: "https://browsergent.com",
  latestVersion: packageJson.version,
  repo: "https://github.com/Irvingouj/Browsergent",
  issues: "https://github.com/Irvingouj/Browsergent/issues",
  releases: "https://github.com/Irvingouj/Browsergent/releases",
} as const;

const v = SITE.latestVersion;
const tag = `v${v}`;
export const DOWNLOADS = {
	// Stable "always latest" link — GitHub redirects
	// /releases/latest/download/<file> to the newest release's asset of
	// that name. The release workflow uploads a version-stable browsergent.zip
	// alias for this. This link never goes stale between releases.
	latestZip: `${SITE.releases}/latest/download/browsergent.zip`,
	// Versioned link (display/fallback — points at this exact release).
	zip: `${SITE.releases}/download/${tag}/browsergent-${v}.zip`,
	// Latest release page (version-agnostic fallback).
	latestRelease: `${SITE.releases}/latest`,
} as const;

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "Docs" },
  { href: "/download", label: "Download" },
] as const;
