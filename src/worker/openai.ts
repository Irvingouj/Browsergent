/**
 * OpenAIProvider — streams LLM responses from any OpenAI Chat Completions
 * compatible endpoint (OpenAI, DeepSeek, OpenRouter, Groq, Together, vLLM,
 * Ollama, LM Studio, Fireworks-openai, etc.).
 *
 * Converts SDK AgentMessage[] → OpenAI wire format, streams SSE back as
 * LlmChunk / LlmResult. The LLM has ONE tool: run_js.
 */

import type { LlmChunk, LlmContext } from "@pi-oxide/pi-host-web/raw";
import type { AgentDiagnosticEvent } from "../types/messages";
import type { LlmStream } from "./llm-streamer";
import { createOpenAIStream } from "./openai-sse";
import { toOpenAIMessages, toOpenAITools } from "./openai-wire";
import { defaultBaseUrlFor } from "./provider-defaults";

export interface OpenAIConfig {
	apiKey: string;
	model: string;
	baseUrl?: string;
}

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

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;
const JITTER_RATIO = 0.25;

function computeBackoff(attempt: number): number {
	const exp = BASE_DELAY_MS * 2 ** (attempt - 1);
	const capped = Math.min(exp, MAX_DELAY_MS);
	const jitter = capped * JITTER_RATIO * (Math.random() * 2 - 1);
	return Math.max(0, Math.round(capped + jitter));
}

function parseRetryAfter(header: string | null): number | undefined {
	if (!header) return undefined;
	const secs = Number(header);
	if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
	const date = Date.parse(header);
	if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
	return undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new DOMException("Aborted", "AbortError"));
			},
			{ once: true },
		);
	});
}

export class OpenAIProvider {
	constructor(
		private config: OpenAIConfig,
		private onDiagnostic: (event: AgentDiagnosticEvent) => void = () => {},
	) {}

	async call(context: LlmContext, signal?: AbortSignal): Promise<LlmStream> {
		const baseUrl = (
			this.config.baseUrl ?? defaultBaseUrlFor("openai")
		).replace(/\/$/, "");

		const body = {
			model: this.config.model,
			messages: toOpenAIMessages(context.messages, context.system_prompt),
			...(context.tools.length > 0
				? { tools: toOpenAITools(context.tools) }
				: {}),
			stream: true,
			max_tokens: 4096,
		};
		const url = `${baseUrl}/v1/chat/completions`;
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
						Authorization: `Bearer ${this.config.apiKey}`,
					},
					body: JSON.stringify(body),
					signal: signal ?? null,
				});

				if (!resp.ok) {
					const errorText = await resp.text();
					lastError = `OpenAI-compatible API error ${resp.status}: ${errorText}`;
					lastStatus = resp.status;
					lastRetryAfterMs = parseRetryAfter(resp.headers.get("retry-after"));
					if (isRetryableStatus(resp.status) && attempt < maxRetries) {
						continue;
					}
					return errorResult("api_error", lastError);
				}

				const responseBody = resp.body;
				if (!responseBody) {
					throw new Error("OpenAI-compatible response has no body");
				}
				return createOpenAIStream(
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
