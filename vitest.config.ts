import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			react: path.resolve(__dirname, "node_modules/preact/compat"),
			"react-dom": path.resolve(__dirname, "node_modules/preact/compat"),
		},
	},
	test: {
		include: [
			"tests/extension-js-types.spec.ts",
			"tests/real-provider-smoke.spec.ts",
			"tests/unit/**/*.spec.ts",
		],
	},
});
