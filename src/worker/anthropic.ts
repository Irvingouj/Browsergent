/**
 * AnthropicProvider — streams LLM responses for the raw WASM host API.
 *
 * Converts SDK AgentMessage[] → Anthropic wire format, streams SSE back as
 * LlmChunk / LlmResult.  The LLM has ONE tool: run_js.
 */

import type { LlmChunk, LlmContext } from "@pi-oxide/pi-host-web/raw";
import type { AgentDiagnosticEvent } from "../types/messages";
import type { AnthropicConfig } from "./anthropic-prompts";
import { BROWSER_TOOLS, SYSTEM_PROMPT } from "./anthropic-prompts";
import { createAnthropicStream } from "./anthropic-sse";
import { toAnthropicMessages, toAnthropicTools } from "./anthropic-wire";
import type { LlmStream } from "./llm-streamer";

export type { AnthropicConfig } from "./anthropic-prompts";
export { BROWSER_TOOLS, SYSTEM_PROMPT };

function isRetryableError(err: unknown): boolean {
	if (err instanceof Error) {
		if (err.name === "TypeError" || err.message.includes("fetch")) return true;
	}
	return false;
}

function isRetryableStatus(status: number): boolean {
	return (
		status === 429 ||
		status === 500 ||
		status === 502 ||
		status === 503 ||
		status === 504
	);
}

export class AnthropicProvider {
	constructor(
		private config: AnthropicConfig,
		private onDiagnostic: (event: AgentDiagnosticEvent) => void = () => {},
	) {}

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
		const url = `${baseUrl}/v1/messages`;
		this.onDiagnostic({
			kind: "provider_request",
			timestamp: Date.now(),
			body,
		});

		const maxRetries = 3;
		let lastError = "";

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			if (attempt > 0) {
				const delay = Math.min(500 * 2 ** (attempt - 1), 8000);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}

			if (signal?.aborted) {
				async function* abortedChunks(): AsyncGenerator<LlmChunk> {
					yield { kind: "error" as const, message: "Request aborted" };
				}
				return {
					chunks: abortedChunks(),
					result: Promise.resolve({
						Err: {
							error: { code: "aborted", message: "Request aborted" },
							aborted: true,
						},
					}),
				};
			}

			try {
				const resp = await fetch(url, {
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
					lastError = `Anthropic API error ${resp.status}: ${errorText}`;
					if (isRetryableStatus(resp.status)) {
						continue;
					}
					async function* errorChunks(): AsyncGenerator<LlmChunk> {
						yield { kind: "error" as const, message: lastError };
					}
					return {
						chunks: errorChunks(),
						result: Promise.resolve({
							Err: {
								error: { code: "api_error", message: lastError },
								aborted: false,
							},
						}),
					};
				}

				const responseBody = resp.body;
				if (!responseBody) {
					throw new Error("Anthropic response has no body");
				}
				return createAnthropicStream(
					responseBody,
					this.config.model,
					signal,
					this.onDiagnostic,
				);
			} catch (err) {
				if (signal?.aborted) {
					async function* abortedChunks(): AsyncGenerator<LlmChunk> {
						yield { kind: "error" as const, message: "Request aborted" };
					}
					return {
						chunks: abortedChunks(),
						result: Promise.resolve({
							Err: {
								error: { code: "aborted", message: "Request aborted" },
								aborted: true,
							},
						}),
					};
				}
				lastError = err instanceof Error ? err.message : String(err);
				if (isRetryableError(err) && attempt < maxRetries) {
					continue;
				}
				async function* netErrorChunks(): AsyncGenerator<LlmChunk> {
					yield { kind: "error" as const, message: lastError };
				}
				return {
					chunks: netErrorChunks(),
					result: Promise.resolve({
						Err: {
							error: { code: "network_error", message: lastError },
							aborted: false,
						},
					}),
				};
			}
		}

		async function* exhaustedChunks(): AsyncGenerator<LlmChunk> {
			yield {
				kind: "error" as const,
				message: lastError || "Retries exhausted",
			};
		}
		return {
			chunks: exhaustedChunks(),
			result: Promise.resolve({
				Err: {
					error: {
						code: "api_error",
						message: lastError || "Retries exhausted",
					},
					aborted: false,
				},
			}),
		};
	}
}
