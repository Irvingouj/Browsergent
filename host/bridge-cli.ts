import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BridgeRequest, BridgeResponse } from "../src/protocol/bridge.ts";

type SentRequest = BridgeRequest & { token: string; sessionId?: string };

interface BridgeConfig {
	token: string;
	sessionId?: string;
}

export class BridgeCli {
	private creatingSession: Promise<string> | null = null;
	private readonly deps: {
		configDir: string;
		send: (request: SentRequest) => Promise<BridgeResponse>;
	};

	constructor(deps: {
		configDir: string;
		send: (request: SentRequest) => Promise<BridgeResponse>;
	}) {
		this.deps = deps;
	}

	private nextId(kind: string): string {
		return `cli-${kind}-${crypto.randomUUID()}`;
	}

	async enroll(token: string): Promise<void> {
		await mkdir(this.deps.configDir, { recursive: true });
		const existing = await this.readConfigOrNull();
		const config: BridgeConfig = {
			token,
			...(existing?.sessionId ? { sessionId: existing.sessionId } : {}),
		};
		await this.writeConfig(config);
	}

	async status(): Promise<{ connected: boolean; enrolled: boolean }> {
		const config = await this.readConfigOrNull();
		try {
			const response = await this.deps.send({
				id: this.nextId("status"),
				token: config?.token ?? "unpaired",
				method: "status",
			});
			if (!response.ok || response.method !== "status") {
				return { connected: false, enrolled: false };
			}
			return response.result;
		} catch {
			return { connected: false, enrolled: false };
		}
	}

	async docs(namespace?: string): Promise<string> {
		const config = await this.readConfig();
		const response = await this.deps.send({
			id: this.nextId("docs"),
			token: config.token,
			...(config.sessionId ? { sessionId: config.sessionId } : {}),
			method: "get_doc",
			params: namespace ? { namespace } : {},
		});
		if (!response.ok || response.method !== "get_doc") {
			throw new Error(this.responseError(response));
		}
		return response.result;
	}

	async reset(): Promise<string> {
		const config = await this.readConfig();
		const response = await this.deps.send({
			id: this.nextId("reset"),
			token: config.token,
			method: "reset",
		});
		if (!response.ok || response.method !== "reset") {
			throw new Error(this.responseError(response));
		}
		return response.result;
	}

	async stop(): Promise<string> {
		const config = await this.readConfig();
		const response = await this.deps.send({
			id: this.nextId("stop"),
			token: config.token,
			method: "stop",
		});
		if (!response.ok || response.method !== "stop") {
			throw new Error(this.responseError(response));
		}
		return response.result;
	}

	async writeFile(path: string, content: string): Promise<string> {
		const config = await this.readConfig();
		const sessionId = await this.ensureSession(config.token, config.sessionId);
		const response = await this.deps.send({
			id: this.nextId("write"),
			token: config.token,
			sessionId,
			method: "file_write",
			params: { path, content },
		});
		if (!response.ok || response.method !== "file_write") {
			throw new Error(this.responseError(response));
		}
		return response.result;
	}

	async run(code: string): Promise<string> {
		const config = await this.readConfig();
		const sessionId = await this.ensureSession(config.token, config.sessionId);
		const response = await this.deps.send({
			id: this.nextId("run"),
			token: config.token,
			sessionId,
			method: "run_js",
			params: { code },
		});
		if (!response.ok || response.method !== "run_js") {
			const message = response.ok
				? `unexpected method ${response.method}`
				: response.error.message;
			throw new Error(message);
		}
		return response.result;
	}

	private responseError(response: BridgeResponse): string {
		return response.ok
			? `unexpected method ${response.method}`
			: response.error.message;
	}

	private configPath(): string {
		return join(this.deps.configDir, "bridge.json");
	}

	private async ensureSession(
		token: string,
		existing?: string,
	): Promise<string> {
		if (existing) return existing;
		if (this.creatingSession) return this.creatingSession;
		this.creatingSession = this.createSession(token).finally(() => {
			this.creatingSession = null;
		});
		return this.creatingSession;
	}

	private async createSession(token: string): Promise<string> {
		const response = await this.deps.send({
			id: this.nextId("session-create"),
			token,
			method: "session.create",
		});
		if (!response.ok || response.method !== "session.create") {
			const message = response.ok
				? `unexpected method ${response.method}`
				: response.error.message;
			throw new Error(message);
		}
		await this.writeConfig({ token, sessionId: response.result.id });
		return response.result.id;
	}

	private async writeConfig(config: BridgeConfig): Promise<void> {
		await mkdir(this.deps.configDir, { recursive: true });
		await writeFile(this.configPath(), JSON.stringify(config), "utf8");
	}

	private async readConfig(): Promise<BridgeConfig> {
		const parsed = await this.readConfigOrNull();
		if (!parsed) throw new Error("bridge.json is missing a token");
		return parsed;
	}

	private async readConfigOrNull(): Promise<BridgeConfig | null> {
		let raw: string;
		try {
			raw = await readFile(this.configPath(), "utf8");
		} catch {
			return null;
		}
		let parsed: unknown;
		try {
			// Untrusted JSON from ~/.browsergent/bridge.json.
			parsed = JSON.parse(raw);
		} catch {
			return null;
		}
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("token" in parsed) ||
			typeof parsed.token !== "string"
		) {
			return null;
		}
		const config: BridgeConfig = { token: parsed.token };
		if ("sessionId" in parsed && typeof parsed.sessionId === "string") {
			config.sessionId = parsed.sessionId;
		}
		return config;
	}
}
