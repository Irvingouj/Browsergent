/**
 * Singleton adapter for @pi-oxide/extension-js.
 *
 * Owns the ExtensionSession lifecycle on the side panel main thread.
 * Both the agent (via worker relay) and the standalone JS tab share
 * this single instance, with access serialized through a queue.
 *
 * Why singleton: extension-js's runner uses a module-level AbortController.
 * Multiple ExtensionSession instances would race on the same abort signal.
 */

import type {
	CellResult,
	ExtensionSession as ExtensionSessionType,
} from "@pi-oxide/extension-js";
import { setLogLevel } from "@pi-oxide/extension-js";
import type { SkillFsClient, SkillFsListEntry } from "../skills/skill-types";
import { browsergentStore } from "../state/store";

const EXTJS_TIMEOUT_MS = 30_000;

export type { CellResult };

interface ExtjsRelayRequest {
	type: "extjsRunRequest";
	id: string;
	code: string;
}

interface ExtjsRelayResult {
	type: "extjsRunResult";
	id: string;
	result: CellResult;
}

interface ExtjsRelayError {
	type: "extjsRunError";
	id: string;
	error: string;
}

interface ExtjsDocsResult {
	type: "extjsDocsResult";
	id: string;
	docs: string;
}

interface ExtjsDocsError {
	type: "extjsDocsError";
	id: string;
	error: string;
}

interface LoadSkillResult {
	type: "loadSkillResult";
	id: string;
	content: string;
}

interface LoadSkillError {
	type: "loadSkillError";
	id: string;
	error: string;
}

type ExtjsRelayResponse =
	| ExtjsRelayResult
	| ExtjsRelayError
	| ExtjsDocsResult
	| ExtjsDocsError
	| LoadSkillResult
	| LoadSkillError;

export type { ExtjsRelayResponse };

function isExtjsRelayResponse(msg: unknown): msg is ExtjsRelayResponse {
	if (typeof msg !== "object" || msg === null) return false;
	const obj = msg as Record<string, unknown>;
	return (
		(obj.type === "extjsRunResult" ||
			obj.type === "extjsRunError" ||
			obj.type === "extjsDocsResult" ||
			obj.type === "extjsDocsError" ||
			obj.type === "loadSkillResult" ||
			obj.type === "loadSkillError") &&
		typeof obj.id === "string"
	);
}

export class ExtensionJsClient implements SkillFsClient {
	private static instance: ExtensionJsClient | null = null;
	private session: ExtensionSessionType | null = null;
	private runnerPromise: Promise<void> | null = null;
	private queue: Promise<unknown> = Promise.resolve();
	private initialized = false;
	private initPromise: Promise<void> | null = null;
	private onFsMutation: (() => void) | null = null;

	private constructor() {}

	static getInstance(): ExtensionJsClient {
		if (!ExtensionJsClient.instance) {
			ExtensionJsClient.instance = new ExtensionJsClient();
		}
		return ExtensionJsClient.instance;
	}

	setOnFsMutation(cb: (() => void) | null): void {
		this.onFsMutation = cb;
	}

	async init(): Promise<void> {
		if (this.initialized) return;
		if (this.initPromise) {
			await this.initPromise;
			return;
		}
		this.initPromise = (async () => {
			const { ExtensionSession } = await import("@pi-oxide/extension-js");
			const [session, runner] = await ExtensionSession.init();
		session.setFuelLimit(Number.MAX_SAFE_INTEGER);
			this.session = session;
			this.runnerPromise = runner;
			this.initialized = true;
			setLogLevel("error");
		})();
		await this.initPromise;
	}

	async runJs(code: string): Promise<CellResult> {
		await this.ensureReady();

		return this.enqueue(
			() => this.executeWithTimeout(code),
			"JS execution failed",
		);
	}

	async getApiDocs(format: "json" | "markdown"): Promise<string> {
		await this.ensureReady();
		return this.executeDocsWithTimeout(format);
	}

	async fsExists(path: string): Promise<boolean> {
		await this.ensureReady();
		return this.enqueue(async () => {
			if (!this.session) throw new Error("ExtensionSession not available");
			const result = await this.session.fs.exists({ path });
			return result.exists;
		}, "fsExists failed");
	}

	async fsList(path: string): Promise<ReadonlyArray<SkillFsListEntry>> {
		await this.ensureReady();
		return this.enqueue(async () => {
			if (!this.session) throw new Error("ExtensionSession not available");
			const result = await this.session.fs.list({ path });
			return result.entries.map((e) => ({ name: e.name, kind: e.kind }));
		}, "fsList failed");
	}

	async fsReadText(path: string): Promise<string> {
		await this.ensureReady();
		return this.enqueue(async () => {
			if (!this.session) throw new Error("ExtensionSession not available");
			const result = await this.session.fs.readText({ path });
			return result.data;
		}, "fsReadText failed");
	}

	async fsWriteText(path: string, data: string): Promise<void> {
		await this.ensureReady();
		await this.enqueue(async () => {
			if (!this.session) throw new Error("ExtensionSession not available");
			await this.session.fs.writeText({ path, data });
		}, "fsWriteText failed");
		this.onFsMutation?.();
	}

	async fsWriteBase64(path: string, base64: string): Promise<void> {
		await this.ensureReady();
		await this.enqueue(async () => {
			if (!this.session) throw new Error("ExtensionSession not available");
			await this.session.fs.writeBase64({ path, data: base64 });
		}, "fsWriteBase64 failed");
		this.onFsMutation?.();
	}

	async fsReadBase64(path: string): Promise<string> {
		await this.ensureReady();
		return this.enqueue(async () => {
			if (!this.session) throw new Error("ExtensionSession not available");
			const result = await this.session.fs.readBase64({ path });
			return result.data;
		}, "fsReadBase64 failed");
	}

	async fsMkdir(path: string): Promise<void> {
		await this.ensureReady();
		await this.enqueue(async () => {
			if (!this.session) throw new Error("ExtensionSession not available");
			await this.session.fs.mkdir({ path });
		}, "fsMkdir failed");
		this.onFsMutation?.();
	}

	async fsDelete(path: string): Promise<void> {
		await this.ensureReady();
		await this.enqueue(async () => {
			if (!this.session) throw new Error("ExtensionSession not available");
			await this.session.fs.delete({ path });
		}, "fsDelete failed");
		this.onFsMutation?.();
	}

	private enqueue<T>(fn: () => Promise<T>, errorLabel: string): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue = this.queue
				.then(async () => {
					try {
						resolve(await fn());
					} catch (err) {
						reject(
							err instanceof Error
								? err
								: new Error(typeof err === "string" ? err : errorLabel),
						);
					}
				})
				.catch(() => {});
		});
	}

	/** Handle a run relay request from the worker. */
	handleRelayRequest(request: ExtjsRelayRequest): void {
		const { id, code } = request;

		this.runJs(code)
			.then((result) => {
				this.dispatchRelayResponse({ type: "extjsRunResult", id, result });
			})
			.catch((err: Error) => {
				if (ExtensionJsClient.relayCallback) {
					this.dispatchRelayResponse({
						type: "extjsRunError",
						id,
						error: err.message,
					});
				} else {
					console.error(
						"[extension-js] relay error with no callback:",
						err.message,
						{ id },
					);
				}
			});
	}

	/** Handle a docs relay request from the worker. */
	handleDocsRelayRequest(request: {
		type: "extjsDocsRequest";
		id: string;
		format: "json" | "markdown";
	}): void {
		const { id, format } = request;

		this.getApiDocs(format)
			.then((docs) => {
				this.dispatchRelayResponse({ type: "extjsDocsResult", id, docs });
			})
			.catch((err: Error) => {
				if (ExtensionJsClient.relayCallback) {
					this.dispatchRelayResponse({
						type: "extjsDocsError",
						id,
						error: err.message,
					});
				} else {
					console.error(
						"[extension-js] docs relay error with no callback:",
						err.message,
						{ id },
					);
				}
			});
	}

	/** Dispatch a relay response to the worker via postMessage. */
	private dispatchRelayResponse(msg: ExtjsRelayResponse): void {
		const handler = ExtensionJsClient.relayCallback;
		if (!handler) {
			console.error(
				"[extension-js] relay response dropped: callback not installed",
				{ type: msg.type, id: msg.id },
			);
			return;
		}
		handler(msg);
	}

	static relayCallback: ((msg: ExtjsRelayResponse) => void) | null = null;

	async stop(): Promise<void> {
		if (!this.session || !this.runnerPromise) return;
		try {
			await this.session.stopWith(this.runnerPromise);
		} catch {
			// Best-effort cleanup — the session may already be broken
		}
		this.session = null;
		this.runnerPromise = null;
		this.initialized = false;
		this.initPromise = null;
		this.queue = Promise.resolve();
		await this.init();
	}

	async dispose(): Promise<void> {
		if (!this.session || !this.runnerPromise) return;
		await this.session.stopWith(this.runnerPromise);
		this.session = null;
		this.runnerPromise = null;
		this.initialized = false;
		this.initPromise = null;
		this.queue = Promise.resolve();
	}

	get isReady(): boolean {
		return this.initialized && this.session !== null;
	}

	private async ensureReady(): Promise<void> {
		if (this.initialized && this.session) return;
		if (this.initPromise) {
			await this.initPromise;
		}
		if (!this.initialized || !this.session) {
			throw new Error("ExtensionJsClient not initialized. Call init() first.");
		}
	}

	private async executeWithTimeout(code: string): Promise<CellResult> {
		if (!this.session) {
			throw new Error("ExtensionSession not available");
		}

		try {
			const result = await Promise.race([
				this.session.runCellAsync(code),
				new Promise<never>((_resolve, reject) => {
					setTimeout(
						() =>
							reject(
								new Error(`JS execution timed out after ${EXTJS_TIMEOUT_MS}ms`),
							),
						EXTJS_TIMEOUT_MS,
					);
				}),
			]);

			return result;
		} catch (err) {
			const isTimeout =
				err instanceof Error &&
				err.message.includes(
					`JS execution timed out after ${EXTJS_TIMEOUT_MS}ms`,
				);
			if (!isTimeout) {
				await this.rebuildSession();
			}
			throw err;
		}
	}

	private async executeDocsWithTimeout(format: string): Promise<string> {
		if (!this.session) {
			throw new Error("ExtensionSession not available");
		}

		const result = await Promise.race([
			this.session.apiDocs(format),
			new Promise<never>((_resolve, reject) => {
				setTimeout(
					() =>
						reject(
							new Error(`Docs relay timed out after ${EXTJS_TIMEOUT_MS}ms`),
						),
					EXTJS_TIMEOUT_MS,
				);
			}),
		]);

		if (typeof result !== "string") {
			return JSON.stringify(result);
		}
		return result;
	}

	/** Tear down the current session and create a fresh one. */
	private async rebuildSession(): Promise<void> {
		const store = browsergentStore.getState();
		store.extjsRestarting("rebuild");

		if (this.session && this.runnerPromise) {
			try {
				await this.session.stopWith(this.runnerPromise);
			} catch {
				// Best-effort cleanup — the session may already be broken
			}
		}

		this.session = null;
		this.runnerPromise = null;
		this.initialized = false;

		try {
			await this.init();
			const session = this.session as ExtensionSessionType | null;
			if (session) {
				await Promise.race([
					session.runCellAsync("1+1"),
					new Promise<never>((_, reject) =>
						setTimeout(
							() => reject(new Error("Runtime health check timed out")),
							5_000,
						),
					),
				]);
			}
			store.extjsReady();
		} catch {
			this.session = null;
			this.runnerPromise = null;
			this.initialized = false;
			this.initPromise = null;
			store.extjsFailed({
				code: "E_JS_RUNTIME",
				message: "Runtime rebuild failed",
				source: "js",
			});
		}
	}
}

/** Type guard for worker relay message handling. */
export function isExtjsRelayRequest(msg: unknown): msg is ExtjsRelayRequest {
	if (typeof msg !== "object" || msg === null) return false;
	const obj = msg as Record<string, unknown>;
	return (
		obj.type === "extjsRunRequest" &&
		typeof obj.id === "string" &&
		typeof obj.code === "string"
	);
}

export type { ExtjsRelayError, ExtjsRelayRequest, ExtjsRelayResult };
export { isExtjsRelayResponse };
