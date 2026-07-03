// Sync public/manifest.json "version" from package.json before builds.
// Keeps a single source of truth (package.json) so the Chrome extension
// version badge, the release tag, and the website all agree.
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);
const manifestPath = new URL("../public/manifest.json", import.meta.url);
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

if (manifest.version !== pkg.version) {
	manifest.version = pkg.version;
	// 2-space indent to match the existing file style.
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	console.info(`sync-manifest: set manifest version to ${pkg.version}`);
} else {
	console.info(`sync-manifest: already at ${pkg.version}`);
}
