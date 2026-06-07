import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "preact",
	},
	resolve: {
		alias: {
			react: path.resolve(__dirname, "node_modules/preact/compat"),
			"react-dom": path.resolve(__dirname, "node_modules/preact/compat"),
		},
	},
	test: {
		include: [
			"tests/extension-js-types.spec.ts",
			"tests/unit/**/*.spec.ts",
			"tests/unit/**/*.spec.tsx",
		],
	},
});
