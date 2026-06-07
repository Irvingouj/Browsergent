import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	timeout: 30000,
	retries: 0,
	use: {
		headless: true,
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	testIgnore: [
		"**/extension-js-types.spec.ts",
		"**/real-provider-smoke.spec.ts",
		"**/unit/**/*.spec.ts",
		"**/unit/**/*.spec.tsx",
	],
});
