/**
 * AnthropicProvider — streams LLM responses for the raw WASM host API.
 *
 * Converts SDK AgentMessage[] → Anthropic wire format, streams SSE back as
 * LlmChunk / LlmResult.  The LLM has ONE tool: run_js.
 */

import type { LlmChunk, LlmContext } from "@pi-oxide/pi-host-web/raw";
import type { AgentDiagnosticEvent } from "../types/messages";
import type { AnthropicConfig } from "./anthropic-prompts";
import {
	BROWSER_TOOLS,
	composeSystemPrompt,
	SYSTEM_PROMPT,
} from "./anthropic-prompts";
import { createAnthropicStream } from "./anthropic-sse";
import { toAnthropicMessages, toAnthropicTools } from "./anthropic-wire";
import type { LlmStream } from "./llm-streamer";

export type { AnthropicConfig } from "./anthropic-prompts";
export { BROWSER_TOOLS, composeSystemPrompt, SYSTEM_PROMPT };

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
		status === 504 ||
		status === 529
	);
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;
const JITTER_RATIO = 0.25;

function computeBackoff(attempt: number): number {
	const exp = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
	const jitter = exp * JITTER_RATIO * (Math.random() * 2 - 1);
	return Math.max(0, Math.round(exp + jitter));
}

function parseRetryAfter(header: string | null): number | undefined {
	if (!header) return undefined;
	const secs = Number(header);
	if (!Number.isNaN(secs)) return secs * 1000;
	const date = Date.parse(header);
	if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
	return undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	if (ms <= 0) {
		resolve();
		return promise;
	}
	const onAbort = () => {
		clearTimeout(timer);
		reject(new DOMException("Aborted", "AbortError"));
	};
	const timer = setTimeout(() => {
		signal?.removeEventListener("abort", onAbort);
		resolve();
	}, ms);
	if (signal) {
		if (signal.aborted) {
			clearTimeout(timer);
			reject(new DOMException("Aborted", "AbortError"));
		} else {
			signal.addEventListener("abort", onAbort, { once: true });
		}
	}
	return promise;
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
		let lastStatus: number | undefined;
		let lastRetryAfterMs: number | undefined;

		function abortedResult(): LlmStream {
			async function* chunks(): AsyncGenerator<LlmChunk> {
				yield { kind: "error" as const, message: "Request aborted" };
			}
			return {
				chunks: chunks(),
				result: Promise.resolve({
					Err: {
						error: { code: "aborted", message: "Request aborted" },
						aborted: true,
					},
				}),
			};
		}

		function errorResult(code: string, message: string): LlmStream {
			async function* chunks(): AsyncGenerator<LlmChunk> {
				yield { kind: "error" as const, message };
			}
			return {
				chunks: chunks(),
				result: Promise.resolve({
					Err: { error: { code, message }, aborted: false },
				}),
			};
		}

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			if (attempt > 0) {
				const delay =
					lastRetryAfterMs !== undefined
						? lastRetryAfterMs
						: computeBackoff(attempt);
				this.onDiagnostic({
					kind: "provider_retry",
					timestamp: Date.now(),
					attempt,
					maxAttempts: maxRetries,
					delayMs: delay,
					status: lastStatus,
					error: lastError,
					recoverable: true,
				});
				try {
					await sleep(delay, signal);
				} catch {
					return abortedResult();
				}
			}

			if (signal?.aborted) {
				return abortedResult();
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
					lastStatus = resp.status;
					lastRetryAfterMs = parseRetryAfter(
						resp.headers.get("retry-after"),
					);
					if (isRetryableStatus(resp.status) && attempt < maxRetries) {
						continue;
					}
					return errorResult("api_error", lastError);
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
					return abortedResult();
				}
				lastError = err instanceof Error ? err.message : String(err);
				lastStatus = undefined;
				lastRetryAfterMs = undefined;
				if (isRetryableError(err) && attempt < maxRetries) {
					continue;
				}
				return errorResult("network_error", lastError);
			}
		}

		return errorResult("api_error", lastError || "Retries exhausted");
	}
}
