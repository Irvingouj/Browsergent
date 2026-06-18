#!/usr/bin/env node
// Packages the built extension in dist/ into a signed CRX3 and an unpacked ZIP.
//
// Usage:
//   node scripts/package-crx.mjs                  # uses CRX_PRIVATE_KEY env (PEM string) — CI path
//   node scripts/package-crx.mjs --key path.pem   # uses a local PEM file — dev path
//
// Outputs go to release/:
//   release/browsergent-<version>.crx
//   release/browsergent-<version>.zip
//   release/update.xml          (points codebase at <version> + download URL)
//
// The --crx-url passed to the script is what Chrome will fetch for auto-update,
// so it must be the public URL of the .crx in your GitHub Release.
//
// The private key pins the extension ID. If the key changes, every user must
// reinstall. See docs/releases.md.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

const { values } = parseArgs({
	options: {
		key: { type: "string" },
		"crx-url": { type: "string" },
		"update-url": { type: "string" },
		out: { type: "string", default: "release" },
	},
});

function fail(msg) {
	console.error(`package-crx: ${msg}`);
	process.exit(1);
}

// 1. Build dist/ fresh so the package matches the source.
console.info("package-crx: building dist/");
execSync("npm run build", { stdio: "inherit", cwd: ROOT });

const distDir = path.join(ROOT, "dist");
if (!existsSync(path.join(distDir, "manifest.json"))) {
	fail("dist/manifest.json missing after build");
}

const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version ?? fail("package.json has no version");

const outDir = path.join(ROOT, values.out);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const crxPath = path.join(outDir, `browsergent-${version}.crx`);
const zipPath = path.join(outDir, `browsergent-${version}.zip`);
const xmlPath = path.join(outDir, "update.xml");

// 2. Resolve the signing key. CI passes it inline via env so the secret never
//    lands on disk; local dev passes a file via --key.
let keyPath = values.key ?? "";
let tmpKeyFile = "";
const envKey = process.env.CRX_PRIVATE_KEY;
if (!keyPath) {
	if (!envKey) {
		fail("no signing key: set CRX_PRIVATE_KEY env or pass --key <path>");
	}
	// crx3 only accepts a keyPath, so materialize the env PEM to a temp file.
	// Temp file lives inside outDir (gitignored) and is removed at the end.
	tmpKeyFile = path.join(outDir, ".key.pem");
	writeFileSync(tmpKeyFile, envKey, { mode: 0o600 });
	keyPath = tmpKeyFile;
}

if (!existsSync(keyPath)) {
	fail(`key file not found: ${keyPath}`);
}

// 3. Package. crx3 (npm) reads manifest.json, zips the tree, signs, writes CRX3
//    and ZIP, and returns the encoded extension appId.
const crx3 = (await import("crx3")).default;

const info = await crx3([distDir], {
	crxPath,
	zipPath,
	keyPath,
	appVersion: version,
});

if (tmpKeyFile) {
	rmSync(tmpKeyFile, { force: true });
}

const appId = info.appId;
if (!appId) {
	fail("crx3 returned no appId — signing failed");
}

// 4. Write update.xml. Chrome fetches this on a schedule and replaces the
//    installed extension if the version here is higher than the installed one.
//    The codebase URL must be publicly reachable and serve the exact .crx.
const crxUrl =
	values["crx-url"] ??
	`https://github.com/Irvingouj/Browsergent/releases/download/v${version}/browsergent-${version}.crx`;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${appId}">
    <updatecheck codebase="${crxUrl}" version="${version}" prodversionmin="120" />
  </app>
</gupdate>
`;
writeFileSync(xmlPath, xml, { mode: 0o644 });

console.info("package-crx: done");
console.info(`  version : ${version}`);
console.info(`  appId   : ${appId}`);
console.info(`  crx     : ${path.relative(ROOT, crxPath)}`);
console.info(`  zip     : ${path.relative(ROOT, zipPath)}`);
console.info(`  update  : ${path.relative(ROOT, xmlPath)}`);
console.info(`  crx-url : ${crxUrl}`);
