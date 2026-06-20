/**
 * Type declarations for @pi-oxide/extension-js.
 * Documents the high-level ExtensionSession API from index.js (0.7.x).
 */

declare module "@pi-oxide/extension-js" {
	export type WasmCellError =
		| {
				kind: "compile";
				name: string | null;
				message: string;
				line: number | null;
		  }
		| {
				kind: "runtime";
				name: string | null;
				message: string;
				line: number | null;
				action: string | null;
				code: string | null;
				stack: string | null;
		  }
		| { kind: "fuel_exhausted" }
		| { kind: "internal"; message: string };

	export type CellResult =
		| {
				status: "ok";
				stdout: string[];
				stderr: string[];
				result: string | null;
				execution_count: number;
		  }
		| {
				status: "err";
				stdout: string[];
				stderr: string[];
				error: WasmCellError;
				execution_count: number;
		  };

	export interface FsPathParams {
		path: string;
	}

	export interface FsWriteParams {
		path: string;
		data: string;
	}

	export interface FsExistsResult {
		exists: boolean;
	}

	export interface FsBoolResult {
		ok: boolean;
	}

	export interface FsStringResult {
		data: string;
	}

	export interface FsListEntry {
		name: string;
		kind: string;
	}

	export interface FsListResult {
		entries: FsListEntry[];
	}

	export interface FsWriteResult {
		path: string;
		bytes_written: number;
	}

	export interface ExtensionSessionFs {
		exists(params: FsPathParams): Promise<FsExistsResult>;
		list(params: FsPathParams): Promise<FsListResult>;
		readText(params: FsPathParams): Promise<FsStringResult>;
		readBase64(params: FsPathParams): Promise<FsStringResult>;
		writeText(params: FsWriteParams): Promise<FsWriteResult>;
		writeBase64(params: FsWriteParams): Promise<FsWriteResult>;
		mkdir(params: FsPathParams): Promise<FsBoolResult>;
		delete(params: FsPathParams): Promise<FsBoolResult>;
	}

	export class ExtensionSession {
		static init(): Promise<[ExtensionSession, Promise<void>]>;
		readonly fs: ExtensionSessionFs;
		apiDocs(format: string): Promise<unknown>;
		runCellAsync(code: string, stdin?: string, traceId?: string): Promise<CellResult>;
		setFuelLimit(limit: number): void;
		stopWith(runnerPromise?: Promise<void>): Promise<void>;
		reset(): Promise<unknown>;
		free(): void;
	}

	export function setLogLevel(level: string): void;
}
