import type { StoreApi } from "zustand/vanilla";
import {
	type BootComponentStatus,
	type BootHealth,
	initialBootHealth,
} from "../../errors/boot-health";
import type { BrowsergentStore } from "../store";

export interface BootSlice {
	boot: BootHealth;
	bootComponentSet(
		component: keyof Pick<BootHealth, "idb" | "extjs" | "worker" | "sw">,
		status: BootComponentStatus,
	): void;
	bootWindowIdSet(windowId: number | null): void;
	bootHostErrorSet(error: {
		code: string;
		message: string;
		source: string;
		ts?: number;
	}): void;
	bootHostErrorDismissed(): void;
}

export function createBootSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): BootSlice {
	return {
		boot: initialBootHealth(),
		bootComponentSet(component, status) {
			set((state) => ({
				boot: { ...state.boot, [component]: status },
			}));
		},
		bootWindowIdSet(windowId) {
			set((state) => ({
				boot: { ...state.boot, windowId },
			}));
		},
		bootHostErrorSet(error) {
			set((state) => ({
				boot: {
					...state.boot,
					lastHostError: {
						code: error.code,
						message: error.message,
						source: error.source,
						ts: error.ts ?? Date.now(),
					},
				},
			}));
		},
		bootHostErrorDismissed() {
			set((state) => ({
				boot: { ...state.boot, lastHostError: null },
			}));
		},
	};
}
