import { copyFileSync } from "node:fs";
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
