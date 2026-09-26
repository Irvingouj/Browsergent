/**
 * OpenAI Responses provider.
 *
 * Used for api.openai.com and for ChatGPT Codex (`chatgpt.com/backend-api`).
 * Codex is selected by `codexAccountId`: that adds the account header the
 * coding-plan backend requires. DeepSeek and other compatible endpoints stay
 * on Chat Completions.
 */

import type { LlmChunk, LlmContext } from "@pi-oxide/pi-host-web/raw";
import type { AgentDiagnosticEvent } from "../types/messages";
import type { LlmStream } from "./llm-streamer";
import { createResponsesStream } from "./openai-responses-sse";
import {
	buildResponsesRequestBody,
	toResponsesInput,
	toResponsesTools,
} from "./openai-responses-wire";

export interface OpenAIResponsesConfig {
	apiKey: string;
	model: string;
	chatEndpointUrl: string;
	codexAccountId?: string;
}

const MAX_OUTPUT_TOKENS = 4096;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

function isRetryableStatus(status: number): boolean {
	return (
		status === 429 ||
		status === 500 ||
		status === 502 ||
		status === 503 ||
		status === 504
	);
}

function computeBackoff(attempt: number): number {
	const exp = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
	const jitter = exp * 0.25 * (Math.random() * 2 - 1);
	return Math.max(0, Math.round(exp + jitter));
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

function codexHeaders(accountId: string): Record<string, string> {
	return {
		"chatgpt-account-id": accountId,
		originator: "pi",
		"OpenAI-Beta": "responses=experimental",
	};
}

export class OpenAIResponsesProvider {
	constructor(
		private config: OpenAIResponsesConfig,
		private onDiagnostic: (event: AgentDiagnosticEvent) => void = () => {},
	) {}

	async call(context: LlmContext, signal?: AbortSignal): Promise<LlmStream> {
		const codex = Boolean(this.config.codexAccountId);
		const body = buildResponsesRequestBody({
			model: this.config.model,
			instructions: context.system_prompt,
			input: toResponsesInput(context.messages),
			tools:
				context.tools.length > 0 ? toResponsesTools(context.tools) : undefined,
			stream: true,
			maxOutputTokens: MAX_OUTPUT_TOKENS,
			codex,
		});
		this.onDiagnostic({
			kind: "provider_request",
			timestamp: Date.now(),
			body,
		});

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "text/event-stream",
			Authorization: `Bearer ${this.config.apiKey}`,
			...(this.config.codexAccountId
				? codexHeaders(this.config.codexAccountId)
				: {}),
		};

		const maxRetries = 3;
		let lastError = "";
		let lastStatus: number | undefined;
		let lastRetryAfterMs: number | undefined;

		const abortedResult = (): LlmStream => {
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
		};

		const errorResult = (code: string, message: string): LlmStream => {
			async function* chunks(): AsyncGenerator<LlmChunk> {
				yield { kind: "error" as const, message };
			}
			return {
				chunks: chunks(),
				result: Promise.resolve({
					Err: { error: { code, message }, aborted: false },
				}),
			};
		};

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			if (attempt > 0) {
				const delay = lastRetryAfterMs ?? computeBackoff(attempt);
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
			if (signal?.aborted) return abortedResult();

			try {
				const resp = await fetch(this.config.chatEndpointUrl.trim(), {
					method: "POST",
					headers,
					body: JSON.stringify(body),
					signal: signal ?? null,
				});
				if (!resp.ok) {
					const errorText = await resp.text();
					lastError = `OpenAI Responses API error ${resp.status}: ${errorText}`;
					lastStatus = resp.status;
					lastRetryAfterMs = parseRetryAfter(resp.headers.get("retry-after"));
					if (isRetryableStatus(resp.status) && attempt < maxRetries) continue;
					return errorResult("api_error", lastError);
				}
				if (!resp.body) {
					return errorResult(
						"api_error",
						"OpenAI Responses response has no body",
					);
				}
				return createResponsesStream(
					resp.body,
					this.config.model,
					signal,
					this.onDiagnostic,
				);
			} catch (err) {
				if (signal?.aborted) return abortedResult();
				lastError = err instanceof Error ? err.message : String(err);
				lastStatus = undefined;
				lastRetryAfterMs = undefined;
				const retryable =
					err instanceof TypeError || lastError.includes("fetch");
				if (retryable && attempt < maxRetries) continue;
				return errorResult("network_error", lastError);
			}
		}

		return errorResult("api_error", lastError || "Retries exhausted");
	}
}
