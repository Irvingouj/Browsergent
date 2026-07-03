#!/usr/bin/env node

// Packages the built extension in dist/ into a versioned ZIP and a
// stable-name alias (browsergent.zip) for /releases/latest/download/.
//
// No CRX signing, no update.xml — the extension is distributed as a
// load-unpacked ZIP. Usage:
//   node scripts/package-zip.mjs              # builds dist/, zips to release/
//   node scripts/package-zip.mjs --no-build  # skip the build step (dist/ already fresh)

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

const { values } = parseArgs({
	options: {
		build: { type: "boolean", default: true },
		"no-build": { type: "boolean", default: false },
		out: { type: "string", default: "release" },
	},
});

if (values.build && !values["no-build"]) {
	console.info("package-zip: building dist/");
	execSync("npm run build", { stdio: "inherit", cwd: ROOT });
}

const distDir = path.join(ROOT, "dist");
if (!existsSync(path.join(distDir, "manifest.json"))) {
	throw new Error("dist/manifest.json missing after build");
}

const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version =
	pkg.version ??
	(() => {
		throw new Error("package.json has no version");
	})();

const outDir = path.join(ROOT, values.out);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const zipVersioned = path.join(outDir, `browsergent-${version}.zip`);
const zipStable = path.join(outDir, "browsergent.zip");

// Zip the dist/ tree preserving relative paths. -X avoids storing extra
// file attributes; -r recurses; --symlinks=false is the default.
execSync(`zip -r -X "${zipVersioned}" .`, { stdio: "inherit", cwd: distDir });

// Stable-name alias so GitHub's /releases/latest/download/browsergent.zip
// always redirects to the newest release's zip.
execSync(`cp "${zipVersioned}" "${zipStable}"`);

console.info("package-zip: done");
console.info(`  version : ${version}`);
console.info(`  zip     : ${path.relative(ROOT, zipVersioned)}`);
console.info(`  stable  : ${path.relative(ROOT, zipStable)}`);
