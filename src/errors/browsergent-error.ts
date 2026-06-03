export type ErrorSource =
	| "ui"
	| "worker"
	| "agent"
	| "llm"
	| "lua"
	| "chrome"
	| "content_script"
	| "settings";

export type BrowsergentErrorCode =
	| "E_NO_API_KEY"
	| "E_BAD_SETTINGS"
	| "E_WORKER_CRASH"
	| "E_LLM_REQUEST"
	| "E_LUA_COMPILE"
	| "E_LUA_RUNTIME"
	| "E_LUA_TIMEOUT"
	| "E_LUA_RELAY"
	| "E_CHROME_PERMISSION"
	| "E_CONTENT_SCRIPT"
	| "E_PROTOCOL"
	| "E_AGENT_RUN"
	| "E_UNKNOWN"
	| "agent_error";

export interface BrowsergentError {
	code: BrowsergentErrorCode;
	message: string;
	source?: ErrorSource;
	details?: Record<string, unknown>;
}
