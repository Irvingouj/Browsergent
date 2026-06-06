/**
 * AnthropicProvider — streams LLM responses for the raw WASM host API.
 *
 * Converts SDK AgentMessage[] → Anthropic wire format, streams SSE back as
 * LlmChunk / LlmResult.  The LLM has ONE tool: run_js.
 */

import type { LlmChunk, LlmContext } from "@pi-oxide/pi-host-web/raw";
import type { AnthropicConfig } from "./anthropic-prompts";
import { BROWSER_TOOLS, SYSTEM_PROMPT } from "./anthropic-prompts";
import { createAnthropicStream } from "./anthropic-sse";
import { toAnthropicMessages, toAnthropicTools } from "./anthropic-wire";
import type { LlmStream } from "./llm-streamer";

export type { AnthropicConfig } from "./anthropic-prompts";
export { BROWSER_TOOLS, SYSTEM_PROMPT };

export class AnthropicProvider {
	constructor(private config: AnthropicConfig) {}

	async call(context: LlmContext, signal?: AbortSignal): Promise<LlmStream> {
		const baseUrl = this.config.baseUrl ?? "https://api.anthropic.com";
		const isFireworks = baseUrl.includes("fireworks.ai");

		const body = {
			model: this.config.model,
			max_tokens: 4096,
			system: context.system_prompt,
			messages: toAnthropicMessages(context.messages),
			tools: toAnthropicTools(context.tools),
			stream: true,
		};

		const resp = await fetch(`${baseUrl}/v1/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(isFireworks
					? { Authorization: `Bearer ${this.config.apiKey}` }
					: {
							"x-api-key": this.config.apiKey,
							"anthropic-version": "2023-06-01",
						}),
			},
			body: JSON.stringify(body),
			signal: signal ?? null,
		});

		if (!resp.ok) {
			const errorText = await resp.text();
			const errorMessage = `Anthropic API error ${resp.status}: ${errorText}`;

			async function* errorChunks(): AsyncGenerator<LlmChunk> {
				yield { kind: "error" as const, message: errorMessage };
			}

			return {
				chunks: errorChunks(),
				result: Promise.resolve({
					Err: {
						error: { code: "api_error", message: errorMessage },
						aborted: false,
					},
				}),
			};
		}

		const responseBody = resp.body;
		if (!responseBody) {
			throw new Error("Anthropic response has no body");
		}
		return createAnthropicStream(responseBody, this.config.model, signal);
	}
}
