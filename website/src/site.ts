import packageJson from "../../package.json";

export const SITE = {
  name: "Browsergent",
  tagline: "AI browser agent for Chrome",
  // Primary meta description (≤160 chars) — keyword-led, benefit-first.
  description:
    "Browsergent is an open-source AI browser agent for Chrome. Type a task in plain English — it sees the page, writes JavaScript, and acts until the job is done.",
  // Longer blurb for JSON-LD / social when space allows.
  longDescription:
    "Browsergent is an experimental open-source AI agent that lives in a Chrome side panel. You describe a browser task in plain English; it reasons with an LLM, generates JavaScript, runs typed page.* commands against the active tab, observes the result, and iterates until done — Claude Code–style autonomy for the web.",
  domain: "browsergent.com",
  url: "https://browsergent.com",
  latestVersion: packageJson.version,
  repo: "https://github.com/Irvingouj/Browsergent",
  issues: "https://github.com/Irvingouj/Browsergent/issues",
  releases: "https://github.com/Irvingouj/Browsergent/releases",
  ogImage: "/og-image.jpg",
  ogImageWidth: 1200,
  ogImageHeight: 630,
  locale: "en_US",
  keywords: [
    "AI browser agent",
    "Chrome AI agent",
    "browser automation",
    "Chrome extension AI",
    "LLM browser agent",
    "Claude browser agent",
    "open source browser agent",
    "side panel AI agent",
    "page automation",
    "BYOK browser agent",
  ],
  sameAs: [
    "https://github.com/Irvingouj/Browsergent",
  ],
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
  { href: "/use-cases", label: "Use cases" },
  { href: "/faq", label: "FAQ" },
  { href: "/download", label: "Download" },
] as const;

export type Breadcrumb = { name: string; href: string };
