// Sync public/manifest.json "version" from package.json before builds.
// String-level replacement to preserve file formatting exactly.
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);
const manifestPath = new URL("../public/manifest.json", import.meta.url);
const content = readFileSync(manifestPath, "utf-8");
const newVersion = pkg.version;
const match = content.match(/"version":\s*"(\d+\.\d+\.\d+)"/);
if (match && match[1] !== newVersion) {
	const updated = content.replace(
		/"version":\s*"\d+\.\d+\.\d+"/,
		`"version": "${newVersion}"`,
	);
	writeFileSync(manifestPath, updated);
	console.info(`sync-manifest: set manifest version to ${newVersion}`);
} else if (!match) {
	console.warn("sync-manifest: could not find version field in manifest.json");
} else {
	console.info(`sync-manifest: already at ${newVersion}`);
}
