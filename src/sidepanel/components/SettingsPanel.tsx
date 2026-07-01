import type { FunctionalComponent } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "zustand/react";
import type { SettingsController } from "../../controllers/settings-controller";
import type { BrowsergentError } from "../../errors/browsergent-error";
import {
	selectActiveProviderId,
	selectProviders,
	selectSettingsError,
	selectSettingsLoaded,
} from "../../state/selectors";
import type { ProviderConfig } from "../../state/slices/settings-slice";
import { browsergentStore } from "../../state/store";
import type { ProviderKind } from "../../types/messages";

// `satisfies Record<ProviderKind,…>` guarantees every kind has a preset, so
// indexing is total — no `!` / fallback needed anywhere.
import {
	PROVIDER_DEFAULTS,
	type ProviderPreset,
} from "../../worker/provider-defaults";
import { testConnection } from "./test-connection";

const INPUT_CLASS =
	"w-full bg-bg-muted border border-border rounded-md px-md py-sm text-text-primary font-mono text-xs outline-none transition-all focus:border-accent focus:ring-[3px] focus:ring-accent-soft placeholder:text-text-dim";
const LABEL_CLASS =
	"block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-xs";

interface SettingsPanelProps {
	settingsController: SettingsController | null;
	onExportConversation: () => void;
}

function newProviderConfig(kind: ProviderKind): ProviderConfig {
	const preset = PROVIDER_DEFAULTS[kind];
	return {
		id: crypto.randomUUID(),
		name: preset.label,
		kind,
		baseUrl: preset.baseUrl,
		apiKey: "",
		model: preset.model,
	};
}
function presetFor(kind: ProviderKind): ProviderPreset {
	return PROVIDER_DEFAULTS[kind];
}

function persist(
	controller: SettingsController | null,
	providers: ProviderConfig[],
	activeProviderId: string | null,
): void {
	controller?.save({ providers, activeProviderId });
}

function SettingsErrorBanner({ error }: { error: BrowsergentError }) {
	return (
		<div
			data-testid="settings-error"
			class="flex items-start gap-sm rounded-md border border-error bg-error/10 px-sm py-xs text-xs text-error"
		>
			<span class="flex-1">{error.message}</span>
			<button
				type="button"
				class="text-error/70 hover:text-error cursor-pointer"
				onClick={() => browsergentStore.getState().settingsErrorDismissed()}
			>
				×
			</button>
		</div>
	);
}

export const SettingsPanel: FunctionalComponent<SettingsPanelProps> = ({
	settingsController,
	onExportConversation,
}) => {
	const providers = useStore(browsergentStore, selectProviders);
	const activeProviderId = useStore(browsergentStore, selectActiveProviderId);
	const loaded = useStore(browsergentStore, selectSettingsLoaded);
	const error = useStore(browsergentStore, selectSettingsError);
	// Track which config is being edited; null = list view.
	const [editingId, setEditingId] = useState<string | null>(null);

	const editing = providers.find((p) => p.id === editingId) ?? null;

	// Ephemeral Test Connection result for the provider being edited. Not in
	// the global store: it's per-edit-session UI state, distinct from the
	// persisted-settings error shown by SettingsErrorBanner.
	const [testState, setTestState] = useState<
		| { status: "idle" }
		| { status: "testing" }
		| { status: "ok" }
		| { status: "error"; error: BrowsergentError }
	>({ status: "idle" });
	const abortRef = useRef<AbortController | null>(null);

	// Reset the indicator whenever the user starts editing a different provider
	// or leaves the edit view — a stale result from provider A must not cling
	// to provider B's form.
	useEffect(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setTestState({ status: "idle" });
	}, [editingId]);

	const runTestConnection = useCallback(async () => {
		if (!editing) return;
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;
		setTestState({ status: "testing" });
		const result = await testConnection(editing, controller.signal);
		if (controller.signal.aborted) return;
		if (result.ok) {
			setTestState({ status: "ok" });
		} else {
			setTestState({ status: "error", error: result.error });
		}
	}, [editing]);

	useEffect(() => {
		if (editingId && !providers.some((p) => p.id === editingId)) {
			setEditingId(null);
		}
	}, [editingId, providers]);

	const updateProvider = useCallback(
		(id: string, patch: Partial<ProviderConfig>) => {
			const next = providers.map((p) => (p.id === id ? { ...p, ...patch } : p));
			browsergentStore.getState().providersChanged(next);
			persist(settingsController, next, activeProviderId);
		},
		[providers, activeProviderId, settingsController],
	);

	const addProvider = useCallback(
		(kind: ProviderKind) => {
			const config = newProviderConfig(kind);
			const next = [...providers, config];
			browsergentStore.getState().providersChanged(next);
			// First provider auto-activates.
			const nextActive = activeProviderId ?? config.id;
			browsergentStore.getState().activeProviderChanged(nextActive);
			persist(settingsController, next, nextActive);
			setEditingId(config.id);
		},
		[providers, activeProviderId, settingsController],
	);

	const deleteProvider = useCallback(
		(id: string) => {
			const next = providers.filter((p) => p.id !== id);
			browsergentStore.getState().providersChanged(next);
			const nextActive =
				activeProviderId === id ? (next[0]?.id ?? null) : activeProviderId;
			browsergentStore.getState().activeProviderChanged(nextActive);
			persist(settingsController, next, nextActive);
			setEditingId(null);
		},
		[providers, activeProviderId, settingsController],
	);

	const duplicateProvider = useCallback(
		(id: string) => {
			const src = providers.find((p) => p.id === id);
			if (!src) return;
			const copy: ProviderConfig = {
				...src,
				id: crypto.randomUUID(),
				name: `${src.name} (copy)`,
				apiKey: "",
			};
			const next = [...providers, copy];
			browsergentStore.getState().providersChanged(next);
			persist(settingsController, next, activeProviderId);
			setEditingId(copy.id);
		},
		[providers, activeProviderId, settingsController],
	);

	const activate = useCallback(
		(id: string) => {
			browsergentStore.getState().activeProviderChanged(id);
			persist(settingsController, providers, id);
		},
		[providers, settingsController],
	);

	if (!loaded) {
		return (
			<div
				data-testid="settings-loading"
				class="flex flex-1 items-center justify-center text-sm text-text-muted"
			>
				Loading settings…
			</div>
		);
	}

	// --- Edit view ---
	if (editing) {
		return (
			<div
				class="settings-edit-view flex-1 overflow-auto p-md flex flex-col gap-md"
				data-testid="settings-edit"
			>
				<div class="flex items-center justify-between">
					<span class="text-sm font-semibold text-text-primary">
						Edit provider
					</span>
					<button
						type="button"
						data-testid="settings-back-button"
						onClick={() => setEditingId(null)}
						class="text-xs text-text-secondary hover:text-text-primary cursor-pointer"
					>
						← Back
					</button>
				</div>

				{error && <SettingsErrorBanner error={error} />}

				<label>
					<span class={LABEL_CLASS}>Name</span>
					<input
						type="text"
						data-testid="settings-name-input"
						value={editing.name}
						onInput={(e) =>
							updateProvider(editing.id, {
								name: (e.target as HTMLInputElement).value,
							})
						}
						class={INPUT_CLASS}
					/>
				</label>

				<label>
					<span class={LABEL_CLASS}>Wire format</span>
					<select
						data-testid="settings-kind-select"
						value={editing.kind}
						onInput={(e) => {
							const raw = (e.target as HTMLSelectElement).value;
							if (raw !== "anthropic" && raw !== "openai") return;
							const kind = raw;
							const preset = presetFor(kind);
							updateProvider(editing.id, {
								kind,
								baseUrl: preset.baseUrl,
								model: preset.model,
							});
						}}
						class={INPUT_CLASS}
					>
						<option value="anthropic">Anthropic (/v1/messages)</option>
						<option value="openai">
							OpenAI-compatible (/v1/chat/completions)
						</option>
					</select>
				</label>

				<label>
					<span class={LABEL_CLASS}>Base URL</span>
					<input
						type="text"
						data-testid="settings-baseurl-input"
						value={editing.baseUrl}
						placeholder={presetFor(editing.kind).baseUrl}
						onInput={(e) =>
							updateProvider(editing.id, {
								baseUrl: (e.target as HTMLInputElement).value,
							})
						}
						class={INPUT_CLASS}
					/>
				</label>

				<label>
					<span class={LABEL_CLASS}>Model</span>
					<input
						type="text"
						data-testid="settings-model-input"
						value={editing.model}
						placeholder={presetFor(editing.kind).model}
						onInput={(e) =>
							updateProvider(editing.id, {
								model: (e.target as HTMLInputElement).value,
							})
						}
						class={INPUT_CLASS}
					/>
				</label>

				<label>
					<span class={LABEL_CLASS}>API Key</span>
					<input
						type="password"
						data-testid="settings-apikey-input"
						value={editing.apiKey}
						onInput={(e) =>
							updateProvider(editing.id, {
								apiKey: (e.target as HTMLInputElement).value,
							})
						}
						class={INPUT_CLASS}
					/>
				</label>

				<div class="flex flex-col gap-xs">
					<button
						type="button"
						data-testid="settings-test-connection-button"
						onClick={() => void runTestConnection()}
						disabled={testState.status === "testing"}
						class="self-start px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary disabled:opacity-60 disabled:cursor-not-allowed"
					>
						{testState.status === "testing" ? "Testing…" : "Test Connection"}
					</button>

					{testState.status === "ok" && (
						<div
							data-testid="settings-test-result"
							class="settings-fade-in flex items-center gap-xs rounded-md border border-success bg-success/10 px-sm py-xs text-xs text-success"
						>
							<span>●</span>
							<span>Connection successful</span>
						</div>
					)}

					{testState.status === "error" && (
						<div
							data-testid="settings-test-result"
							class="settings-fade-in flex items-start gap-sm rounded-md border border-error bg-error/10 px-sm py-xs text-xs text-error"
						>
							<span class="flex-1">
								<span class="font-mono">[{testState.error.code}]</span>{" "}
								{testState.error.message}
							</span>
							<button
								type="button"
								class="text-error/70 hover:text-error cursor-pointer"
								onClick={() => setTestState({ status: "idle" })}
							>
								×
							</button>
						</div>
					)}
				</div>

				<div class="flex gap-sm mt-sm">
					<button
						type="button"
						data-testid="settings-done-button"
						onClick={() => setEditingId(null)}
						class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-text-primary text-bg-base hover:bg-text-secondary"
					>
						Done
					</button>
					<button
						type="button"
						data-testid="settings-duplicate-button"
						onClick={() => duplicateProvider(editing.id)}
						class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary"
					>
						Duplicate
					</button>
					<button
						type="button"
						data-testid="settings-delete-button"
						onClick={() => deleteProvider(editing.id)}
						class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer text-error border border-border-strong hover:border-error"
					>
						Delete
					</button>
				</div>
			</div>
		);
	}

	// --- List view ---
	return (
		<div
			class="settings-list-view flex-1 overflow-auto p-md flex flex-col gap-md"
			data-testid="settings-list"
		>
			<div class="flex items-center justify-between">
				<span class="text-sm font-semibold text-text-primary">Providers</span>
			</div>

			{error && <SettingsErrorBanner error={error} />}

			{providers.length === 0 ? (
				<div class="text-xs text-text-muted py-md">
					No provider configured. Add one to start running tasks.
				</div>
			) : (
				<div class="flex flex-col gap-sm">
					{providers.map((p) => {
						const isActive = p.id === activeProviderId;
						return (
							<div
								key={p.id}
								class={`settings-provider-row rounded-md border p-sm flex items-center gap-sm ${isActive ? "border-accent bg-accent-soft" : "border-border bg-bg-muted"}`}
							>
								<button
									type="button"
									data-testid={`settings-activate-${p.id}`}
									onClick={() => activate(p.id)}
									class="flex-1 text-left cursor-pointer"
									title={isActive ? "Active provider" : "Click to activate"}
								>
									<div class="text-xs font-semibold text-text-primary">
										{p.name || "(unnamed)"}
										{isActive && (
											<span class="ml-xs text-accent normal-case">
												● active
											</span>
										)}
									</div>
									<div class="text-[10px] text-text-muted font-mono">
										{p.kind} · {p.model || "(no model)"}
									</div>
								</button>
								<button
									type="button"
									data-testid={`settings-edit-${p.id}`}
									onClick={() => setEditingId(p.id)}
									class="text-xs text-text-secondary hover:text-text-primary cursor-pointer px-xs"
								>
									Edit
								</button>
							</div>
						);
					})}
				</div>
			)}

			<div class="flex gap-sm">
				<button
					type="button"
					data-testid="settings-add-anthropic"
					onClick={() => addProvider("anthropic")}
					class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary"
				>
					+ Anthropic
				</button>
				<button
					type="button"
					data-testid="settings-add-openai"
					onClick={() => addProvider("openai")}
					class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary"
				>
					+ OpenAI-compatible
				</button>
			</div>

			<hr class="border-border my-sm" />

			<div class="flex flex-col gap-xs">
				<span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
					Data
				</span>
				<button
					type="button"
					data-testid="settings-export-button"
					onClick={onExportConversation}
					class="self-start px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary"
				>
					Export conversation
				</button>
			</div>

			<hr class="border-border my-sm" />

			<div class="flex flex-col gap-xs">
				<span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
					About
				</span>
				<span class="text-[10px] text-text-muted font-mono">
					Browsergent — Claude Code for the browser. LLM does reasoning, JS does
					acting.
				</span>
			</div>
		</div>
	);
};
