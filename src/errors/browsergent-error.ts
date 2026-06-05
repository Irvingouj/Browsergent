export type ErrorSource =
	| "ui"
	| "worker"
	| "agent"
	| "llm"
	| "js"
	| "chrome"
	| "content_script"
	| "settings";

export type BrowsergentErrorCode =
	| "E_NO_API_KEY"
	| "E_BAD_SETTINGS"
	| "E_WORKER_CRASH"
	| "E_LLM_REQUEST"
	| "E_JS_COMPILE"
	| "E_JS_RUNTIME"
	| "E_JS_TIMEOUT"
	| "E_JS_RELAY"
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
