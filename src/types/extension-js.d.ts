/**
 * Type declarations for @pi-oxide/extension-js.
 * Bridges gaps until upstream index.d.ts exports all runtime symbols.
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

	export class ExtensionSession {
		static init(): Promise<[ExtensionSession, Promise<void>]>;
		apiDocs(format: string): Promise<unknown>;
		runCellAsync(code: string, stdin?: string): Promise<CellResult>;
		setFuelLimit(limit: number): void;
		stopWith(runnerPromise?: Promise<void>): Promise<void>;
		reset(): void;
		free(): void;
		fsExists(params: FsPathParams): Promise<FsExistsResult>;
		fsList(params: FsPathParams): Promise<FsListResult>;
		fsReadText(params: FsPathParams): Promise<FsStringResult>;
		fsWriteText(params: FsWriteParams): Promise<FsBoolResult>;
		fsMkdir(params: FsPathParams): Promise<FsBoolResult>;
		fsDelete(params: FsPathParams): Promise<FsBoolResult>;
	}

	export function setLogLevel(level: string): void;
}
