import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "node:path";

const piOxidePkg = path.resolve(__dirname, "../pi-oxide/pi-host-web/pkg");
const piccoloPkg = path.resolve(__dirname, "../web-lua/crates/piccolo-notebook-wasm/pkg");

export default defineConfig({
  base: "./",
  plugins: [
    preact(),
    viteStaticCopy({
      targets: [
        { src: `${piOxidePkg}/pi_host_web.js`, dest: "pkg" },
        { src: `${piOxidePkg}/pi_host_web_bg.wasm`, dest: "pkg" },
        { src: `${piccoloPkg}/piccolo_notebook_wasm.js`, dest: "pkg" },
        { src: `${piccoloPkg}/piccolo_notebook_wasm_bg.wasm`, dest: "pkg" },
      ],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: path.resolve(__dirname, "sidepanel.html"),
        worker: path.resolve(__dirname, "src/worker/index.ts"),
        background: path.resolve(__dirname, "src/background/index.ts"),
        "content-script": path.resolve(__dirname, "src/content/index.ts"),
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
