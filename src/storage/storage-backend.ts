export interface StorageBackend {
	get<T>(store: string, key: string): Promise<T | null>;
	set<T>(store: string, key: string, value: T): Promise<void>;
	remove(store: string, key: string): Promise<void>;
	getAll<T>(store: string): Promise<T[]>;
	getAllKeys(store: string): Promise<string[]>;
	clear(): Promise<void>;
	close(): Promise<void>;
}
