import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/extension-lua-types.spec.ts", "tests/real-provider-smoke.spec.ts"],
	},
});
