/**
 * Real provider smoke test — exercises Agent.create() + Agent.run()
 * with a real LLM API. Skips if no credentials are available.
 *
 * Run: FIREWORKS_KEY=fpk_xxx npx vitest run tests/real-provider-smoke.spec.ts
 */
import { describe, expect, test } from "vitest";
import { Agent, toolResult, toolError } from "@pi-oxide/pi-host-web";
import { AnthropicProvider, SYSTEM_PROMPT } from "../src/worker/anthropic";

const FIREWORKS_KEY = process.env.FIREWORKS_KEY ?? "";
const FIREWORKS_MODEL =
	process.env.FIREWORKS_MODEL ??
	"accounts/fireworks/routers/kimi-k2p6-turbo";
const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference";

const skip = !FIREWORKS_KEY;

describe.skipIf(skip)("real provider smoke", () => {
	test("Agent.create + Agent.run with AnthropicProvider", async () => {
		const provider = new AnthropicProvider(
			{
				apiKey: FIREWORKS_KEY,
				baseUrl: FIREWORKS_BASE_URL,
				model: FIREWORKS_MODEL,
			},
			undefined,
		);

		const events: string[] = [];
		let responseText = "";

		const agent = await Agent.create({
			system_prompt: SYSTEM_PROMPT,
			model: {
				id: FIREWORKS_MODEL,
				name: FIREWORKS_MODEL,
				api: "anthropic",
				provider: "anthropic",
				reasoning: false,
				context_window: 200_000,
				max_tokens: 4096,
				capabilities: {
					vision: false,
					json_mode: false,
					function_calling: true,
					streaming: true,
				},
				cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
			},
			thinking_level: "off",
			tools: [
				{
					name: "run_lua",
					label: "Run Lua",
					description: "Execute Lua code.",
					parameters: {
						type: "object",
						properties: {
							code: {
								type: "string",
								description: "Lua code to execute",
							},
						},
						required: ["code"],
					},
					execution_mode: "sequential",
				},
			],
			tool_execution_mode: "sequential",
		});

		const result = await agent.run("Say hello and tell me you are working.", {
			llm: provider,
			tools: {
				run_lua: async (call) => {
					const args = call.arguments as Record<string, unknown>;
					const code = args.code;
					if (typeof code !== "string") {
						return toolError("invalid", "no code");
					}
					return toolResult(`Simulated Lua output for: ${code.slice(0, 50)}`);
				},
			},
			onEvent: (event) => {
				events.push(event.type);
				if (
					event.type === "message_update" &&
					event.delta.kind === "text_delta"
				) {
					responseText += event.delta.text;
				}
			},
		});

		console.log("Final action type:", result.type);
		console.log("Events received:", [...new Set(events)]);
		console.log("Response text:", responseText);

		expect(events.length).toBeGreaterThan(0);
		expect(events).toContain("message_update");
			expect(events).toContain("message_end");
		expect(responseText.length).toBeGreaterThan(0);

		agent.destroy();
	}, 30_000);
});
