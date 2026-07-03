import { describe, expect, test } from "vitest";
import {
	defaultModelForProvider,
	type ProviderConfig,
} from "../../src/state/slices/settings-slice";

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
	return {
		id: "p1",
		name: "Test",
		providerId: "anthropic",
		wireFormat: "anthropic-messages",
		apiKey: "k",
		chatEndpointUrl: "https://api.anthropic.com/v1/messages",
		modelsEndpointUrl: "",
		defaultModelId: "m1",
		models: [
			{
				id: "m1",
				name: "first",
				model: "first",
			},
			{
				id: "m2",
				name: "second",
				model: "second",
			},
		],
		...overrides,
	};
}

describe("defaultModelForProvider", () => {
	test("returns the model matching defaultModelId", () => {
		const p = makeProvider({ defaultModelId: "m2" });
		const model = defaultModelForProvider(p);
		expect(model?.id).toBe("m2");
	});

	test("falls back to models[0] when defaultModelId does not match", () => {
		const p = makeProvider({ defaultModelId: "nonexistent" });
		const model = defaultModelForProvider(p);
		expect(model?.id).toBe("m1");
	});

	test("falls back to models[0] when defaultModelId is empty", () => {
		const p = makeProvider({ defaultModelId: "" });
		const model = defaultModelForProvider(p);
		expect(model?.id).toBe("m1");
	});

	test("returns null when models is empty", () => {
		const p = makeProvider({ models: [], defaultModelId: "" });
		expect(defaultModelForProvider(p)).toBeNull();
	});

	test("returns null when models is empty and defaultModelId is set", () => {
		const p = makeProvider({ models: [], defaultModelId: "dangling" });
		expect(defaultModelForProvider(p)).toBeNull();
	});
});
