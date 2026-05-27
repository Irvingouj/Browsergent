import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
  },
  testIgnore: ["**/extension-lua-types.spec.ts", "**/real-provider-smoke.spec.ts"],
});
