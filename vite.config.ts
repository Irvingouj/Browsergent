import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "node:path";
import { copyFileSync } from "node:fs";

export default defineConfig({
  base: "./",
  plugins: [
    preact(),
    {
      name: "copy-extension-lua-assets",
      writeBundle(options) {
        const outDir = options.dir ?? "dist";
        const src = path.resolve(
          __dirname,
          "node_modules/@pi-oxide/extension-lua/content-script.js",
        );
        const dest = path.resolve(outDir, "content-script.js");
        try {
          copyFileSync(src, dest);
        } catch {
          console.warn("extension-lua content-script.js not found, skipping copy");
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
        worker: path.resolve(__dirname, "src/worker/index.ts"),
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
