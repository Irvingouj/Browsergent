import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	// Extension boot + two-window flows exceed 30s under load.
	timeout: 90_000,
	retries: 0,
	use: {
		headless: true,
		screenshot: "only-on-failure",
		// CDP tracing on chrome-extension:// pages freezes page.evaluate /
		// Locator actions after some interactions (settings Done, etc.).
		// Keep off until Playwright/Chromium tracing is fixed for extensions.
		trace: "off",
		actionTimeout: 20_000,
	},
	testIgnore: [
		"**/extension-js-types.spec.ts",
		"**/unit/**/*.spec.ts",
		"**/unit/**/*.spec.tsx",
		// Diagnostic / bench harnesses — not product gates
		"**/_diag-*.spec.ts",
		"**/_bench-*.spec.ts",
		// Live DeepSeek smoke — run via real-run skill / explicit path, not mock suite
		"**/real-deepseek.spec.ts",
	],
});
