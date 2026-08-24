import type { StorageBackend } from "../storage/storage-backend";

const STORE = "settings";
const TOKEN_KEY = "bridgeEnrollmentToken";
const PAIRED_KEY = "bridgeCliEnrolled";

export class EnrollmentController {
	constructor(private readonly storage: StorageBackend) {}

	async generate(): Promise<string> {
		const token = crypto.randomUUID();
		await this.storage.set(STORE, TOKEN_KEY, token);
		await this.storage.set(STORE, PAIRED_KEY, false);
		return token;
	}

	async current(): Promise<string | null> {
		// Storage may hold a legacy or corrupted value.
		const raw: unknown = await this.storage.get(STORE, TOKEN_KEY);
		if (typeof raw !== "string" || raw.length === 0) return null;
		return raw;
	}

	async revoke(): Promise<void> {
		await this.storage.remove(STORE, TOKEN_KEY);
		await this.storage.remove(STORE, PAIRED_KEY);
	}

	async setCliEnrolled(enrolled: boolean): Promise<void> {
		await this.storage.set(STORE, PAIRED_KEY, enrolled);
	}

	async wasCliEnrolled(): Promise<boolean> {
		const raw: unknown = await this.storage.get(STORE, PAIRED_KEY);
		return raw === true;
	}

	async matches(token: string): Promise<boolean> {
		const current = await this.current();
		return current !== null && current === token;
	}
}
