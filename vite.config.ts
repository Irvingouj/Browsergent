import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	base: "./",
	resolve: {
		alias: [],
	},
	plugins: [
		preact(),
		tailwindcss(),
		{
			name: "copy-extension-js-assets",
			writeBundle(options) {
				const outDir = options.dir ?? "dist";
				const files = [
					{
						src: "node_modules/@pi-oxide/extension-js/content-script.js",
						dest: "content-script.js",
					},
					{
						src: "node_modules/@pi-oxide/extension-js/extension_js.js",
						dest: "extension_js.js",
					},
					{
						src: "node_modules/@pi-oxide/extension-js/worker.js",
						dest: "worker.js",
					},
				];
				for (const { src: srcRel, dest: destRel } of files) {
					const src = path.resolve(__dirname, srcRel);
					const dest = path.resolve(outDir, destRel);
					try {
						copyFileSync(src, dest);
					} catch {
						console.warn(`${srcRel} not found, skipping copy`);
					}
				}

				copyBundledSkillsWithManifest(outDir);
			},
		},
	],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				sidepanel: path.resolve(__dirname, "sidepanel.html"),
				"agent-worker": path.resolve(__dirname, "src/worker/index.ts"),
				background: path.resolve(__dirname, "src/background/index.ts"),
			},
			output: {
				entryFileNames: "[name].js",
				chunkFileNames: "chunks/[name]-[hash].js",
				assetFileNames: "[name][extname]",
			},
		},
		target: "chrome120",
		minify: false,
	},
});

function copyBundledSkillsWithManifest(outDir: string): void {
	const srcRoot = path.resolve(__dirname, "public/skills/bundled");
	const destRoot = path.resolve(outDir, "skills/bundled");
	const manifestFiles: Array<{ path: string; sha256: string }> = [];

	function walk(relativeDir: string): void {
		const absDir = path.join(srcRoot, relativeDir);
		for (const entry of readdirSync(absDir, { withFileTypes: true })) {
			const rel = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
			const srcPath = path.join(srcRoot, rel);
			const destPath = path.join(destRoot, rel);
			if (entry.isDirectory()) {
				mkdirSync(destPath, { recursive: true });
				walk(rel);
				continue;
			}
			mkdirSync(path.dirname(destPath), { recursive: true });
			const content = readFileSync(srcPath);
			copyFileSync(srcPath, destPath);
			const sha256 = createHash("sha256").update(content).digest("hex");
			manifestFiles.push({
				path: `/skills/bundled/${rel.replace(/\\/g, "/")}`,
				sha256,
			});
		}
	}

	try {
		mkdirSync(destRoot, { recursive: true });
		walk("");
	} catch {
		console.warn("public/skills/bundled not found, skipping skills copy");
		return;
	}

	const pkg = JSON.parse(
		readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
	) as { version?: string };
	const version = `${pkg.version ?? "0.0.0"}-${createHash("sha256").update(JSON.stringify(manifestFiles)).digest("hex").slice(0, 12)}`;

	mkdirSync(path.resolve(outDir, "skills"), { recursive: true });
	writeFileSync(
		path.resolve(outDir, "skills/seed-manifest.json"),
		JSON.stringify({ version, files: manifestFiles }, null, 2),
	);
}
