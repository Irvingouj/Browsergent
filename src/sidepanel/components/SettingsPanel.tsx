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
import {
	ProviderId,
	tokenLimitParamSchema,
	WireFormat,
} from "../../types/messages";
import { getPreset } from "../../worker/provider-registry";
import type { ProviderPreset } from "../../worker/provider-schema";
import { discoverProviderModels } from "./model-discovery";
import { testConnection } from "./test-connection";

const INPUT_CLASS =
	"w-full bg-bg-muted border border-border rounded-md px-md py-sm text-text-primary font-mono text-xs outline-none transition-all focus:border-accent focus:ring-[3px] focus:ring-accent-soft placeholder:text-text-dim";
const LABEL_CLASS =
	"block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-xs";

interface SettingsPanelProps {
	settingsController: SettingsController | null;
	onExportConversation: () => void;
}

function modelsFromPreset(preset: ProviderPreset): {
	models: ProviderConfig["models"];
	defaultModelId: string;
} {
	if (!preset.defaultModel) return { models: [], defaultModelId: "" };
	const id = crypto.randomUUID();
	return {
		models: [
			{
				id,
				name: preset.defaultModel,
				model: preset.defaultModel,
				tokenLimitParam: preset.tokenLimitParam,
			},
		],
		defaultModelId: id,
	};
}
function newProviderConfig(providerId: ProviderId): ProviderConfig {
	const preset = getPreset(providerId);
	if (preset) {
		const { models, defaultModelId } = modelsFromPreset(preset);
		return {
			id: crypto.randomUUID(),
			name: preset.label,
			providerId,
			wireFormat: preset.wireFormat,
			apiKey: "",
			chatEndpointUrl: preset.chatEndpointUrl,
			modelsEndpointUrl: preset.modelsEndpointUrl,
			defaultModelId,
			models,
		};
	}
	return {
		id: crypto.randomUUID(),
		name: "Custom",
		providerId,
		wireFormat: WireFormat.OpenAIChatCompletions,
		apiKey: "",
		chatEndpointUrl: "",
		modelsEndpointUrl: "",
		defaultModelId: "",
		models: [],
	};
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
	const [discoveryState, setDiscoveryState] = useState<
		| { status: "idle" }
		| { status: "loading" }
		| { status: "ok"; count: number }
		| { status: "error"; message: string }
	>({ status: "idle" });
	const [modelDraft, setModelDraft] = useState("");
	const abortRef = useRef<AbortController | null>(null);
	const discoveryAbortRef = useRef<AbortController | null>(null);

	// Reset the indicator whenever the user starts editing a different provider
	// or leaves the edit view — a stale result from provider A must not cling
	// to provider B's form.
	useEffect(() => {
		abortRef.current?.abort();
		discoveryAbortRef.current?.abort();
		abortRef.current = null;
		discoveryAbortRef.current = null;
		setTestState({ status: "idle" });
		setDiscoveryState({ status: "idle" });
		setModelDraft("");
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

	const runModelDiscovery = useCallback(async () => {
		if (!editing) return;
		discoveryAbortRef.current?.abort();
		const controller = new AbortController();
		discoveryAbortRef.current = controller;
		setDiscoveryState({ status: "loading" });
		const tokenLimitParam =
			getPreset(editing.providerId)?.tokenLimitParam ??
			editing.models[0]?.tokenLimitParam ??
			"max_completion_tokens";
		const result = await discoverProviderModels(
			editing,
			tokenLimitParam,
			controller.signal,
		);
		if (controller.signal.aborted) return;
		if (!result.ok) {
			setDiscoveryState({ status: "error", message: result.error });
			return;
		}

		const current = browsergentStore
			.getState()
			.settings.providers.find((p) => p.id === editing.id);
		if (!current) return;
		const byModel = new Map(current.models.map((m) => [m.model, m]));
		const discoveredModelStrings = new Set(result.models.map((m) => m.model));
		const merged = [
			...result.models.map((model) => ({
				...model,
				id: byModel.get(model.model)?.id ?? model.id,
			})),
			...current.models.filter((m) => !discoveredModelStrings.has(m.model)),
		];
		// Models come back sorted latest-first from discovery. Always default
		// to the newest model — that's the whole point of the fetch button.
		updateProvider(editing.id, {
			models: merged,
			defaultModelId: merged[0]?.id ?? "",
		});
		setDiscoveryState({ status: "ok", count: merged.length });
	}, [editing, updateProvider]);

	const addModel = useCallback(
		(provider: ProviderConfig, model: string) => {
			const value = model.trim();
			if (!value || provider.models.some((m) => m.model === value)) return;
			const nextModel = {
				id: crypto.randomUUID(),
				name: value,
				model: value,
				tokenLimitParam:
					getPreset(provider.providerId)?.tokenLimitParam ??
					"max_completion_tokens",
			};
			updateProvider(provider.id, {
				models: [...provider.models, nextModel],
				defaultModelId: provider.defaultModelId || nextModel.id,
			});
		},
		[updateProvider],
	);

	const deleteModel = useCallback(
		(provider: ProviderConfig, modelId: string) => {
			const nextModels = provider.models.filter((m) => m.id !== modelId);
			updateProvider(provider.id, {
				models: nextModels,
				defaultModelId:
					provider.defaultModelId === modelId
						? (nextModels[0]?.id ?? "")
						: provider.defaultModelId,
			});
		},
		[updateProvider],
	);

	const addProvider = useCallback(
		(providerId: ProviderId, wireFormat?: WireFormat) => {
			const config = wireFormat
				? { ...newProviderConfig(providerId), wireFormat }
				: newProviderConfig(providerId);
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
			const copiedModels = src.models.map((model) => ({
				...model,
				id: crypto.randomUUID(),
			}));
			const sourceDefaultIndex = src.models.findIndex(
				(model) => model.id === src.defaultModelId,
			);
			const copy: ProviderConfig = {
				...src,
				id: crypto.randomUUID(),
				name: `${src.name} (copy)`,
				apiKey: "",
				models: copiedModels,
				defaultModelId:
					copiedModels[sourceDefaultIndex >= 0 ? sourceDefaultIndex : 0]?.id ??
					"",
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
					<span class={LABEL_CLASS}>Provider</span>
					<select
						data-testid="settings-kind-select"
						value={
							editing.providerId === ProviderId.Custom
								? editing.wireFormat === WireFormat.AnthropicMessages
									? "anthropic-compatible"
									: "openai-compatible"
								: editing.providerId
						}
						onInput={(e) => {
							const raw = (e.target as HTMLSelectElement).value;
							let providerId: ProviderId;
							let wireFormat: WireFormat;
							switch (raw) {
								case "anthropic":
									providerId = ProviderId.Anthropic;
									wireFormat = WireFormat.AnthropicMessages;
									break;
								case "openai":
									providerId = ProviderId.OpenAI;
									wireFormat = WireFormat.OpenAIChatCompletions;
									break;
								case "deepseek":
									providerId = ProviderId.DeepSeek;
									wireFormat = WireFormat.OpenAIChatCompletions;
									break;
								case "openai-compatible":
									providerId = ProviderId.Custom;
									wireFormat = WireFormat.OpenAIChatCompletions;
									break;
								case "anthropic-compatible":
									providerId = ProviderId.Custom;
									wireFormat = WireFormat.AnthropicMessages;
									break;
								default:
									return;
							}
							const preset = getPreset(providerId);
							const { models, defaultModelId } = preset
								? modelsFromPreset(preset)
								: { models: [], defaultModelId: "" };
							updateProvider(editing.id, {
								providerId,
								wireFormat,
								chatEndpointUrl: preset?.chatEndpointUrl ?? "",
								modelsEndpointUrl: preset?.modelsEndpointUrl ?? "",
								defaultModelId,
								models,
							});
						}}
						class={INPUT_CLASS}
					>
						<option value="anthropic">Anthropic</option>
						<option value="openai">OpenAI (Chat Completions)</option>
						<option value="deepseek">DeepSeek</option>
						<option value="openai-compatible">
							OpenAI-compatible (Chat Completions)
						</option>
						<option value="anthropic-compatible">Anthropic-compatible</option>
					</select>
				</label>

				<label>
					<span class={LABEL_CLASS}>Endpoint URL</span>
					<input
						type="text"
						data-testid="settings-baseurl-input"
						value={editing.chatEndpointUrl}
						placeholder={getPreset(editing.providerId)?.chatEndpointUrl ?? ""}
						onInput={(e) =>
							updateProvider(editing.id, {
								chatEndpointUrl: (e.target as HTMLInputElement).value,
							})
						}
						class={INPUT_CLASS}
					/>
				</label>

				<label>
					<span class={LABEL_CLASS}>Models endpoint URL</span>
					<input
						type="text"
						data-testid="settings-models-endpoint-input"
						value={editing.modelsEndpointUrl ?? ""}
						placeholder={getPreset(editing.providerId)?.modelsEndpointUrl ?? ""}
						onInput={(e) =>
							updateProvider(editing.id, {
								modelsEndpointUrl: (e.target as HTMLInputElement).value,
							})
						}
						class={INPUT_CLASS}
					/>
				</label>

				{editing.providerId !== ProviderId.Custom && (
					<div class="flex flex-col gap-xs">
						<button
							type="button"
							data-testid="settings-fetch-models-button"
							onClick={() => void runModelDiscovery()}
							disabled={discoveryState.status === "loading"}
							class="self-start px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary disabled:opacity-60 disabled:cursor-not-allowed"
						>
							{discoveryState.status === "loading"
								? "Fetching…"
								: "Fetch models"}
						</button>
						{discoveryState.status === "ok" && (
							<span
								data-testid="settings-fetch-models-result"
								class="text-xs text-success"
							>
								Loaded {discoveryState.count} models
							</span>
						)}
						{discoveryState.status === "error" && (
							<span
								data-testid="settings-fetch-models-result"
								class="text-xs text-error"
							>
								{discoveryState.message}
							</span>
						)}
					</div>
				)}

				<div class="flex flex-col gap-sm">
					<label>
						<span class={LABEL_CLASS}>Default model</span>
						<select
							data-testid="settings-default-model-select"
							value={editing.defaultModelId}
							onInput={(e) => {
								updateProvider(editing.id, {
									defaultModelId: (e.target as HTMLSelectElement).value,
								});
							}}
							class={INPUT_CLASS}
						>
							{editing.models.length === 0 ? (
								<option value="">No model configured</option>
							) : (
								editing.models.map((model) => (
									<option key={model.id} value={model.id}>
										{model.name || model.model}
									</option>
								))
							)}
						</select>
					</label>

					<div class="flex gap-sm">
						<input
							type="text"
							data-testid="settings-model-input"
							value={modelDraft}
							placeholder="model id"
							onInput={(e) =>
								setModelDraft((e.target as HTMLInputElement).value)
							}
							class={INPUT_CLASS}
						/>
						<button
							type="button"
							data-testid="settings-add-model-button"
							onClick={() => {
								addModel(editing, modelDraft);
								setModelDraft("");
							}}
							class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary whitespace-nowrap"
						>
							Add
						</button>
					</div>

					<div class="flex flex-col gap-xs">
						{editing.models.map((model) => (
							<div
								key={model.id}
								class="rounded-md border border-border bg-bg-muted p-sm flex items-center gap-sm"
							>
								<span class="flex-1 min-w-0 text-xs font-mono text-text-primary truncate">
									{model.model}
								</span>
								{editing.wireFormat !== WireFormat.AnthropicMessages && (
									<select
										data-testid={`settings-model-token-param-${model.id}`}
										value={model.tokenLimitParam}
										onInput={(e) => {
											const raw = (e.target as HTMLSelectElement).value;
											if (
												raw !== "max_tokens" &&
												raw !== "max_completion_tokens"
											)
												return;
											updateProvider(editing.id, {
												models: editing.models.map((m) =>
													m.id === model.id
														? {
																...m,
																tokenLimitParam:
																	tokenLimitParamSchema.parse(raw),
															}
														: m,
												),
											});
										}}
										class="bg-bg-muted border border-border rounded-md px-xs py-xs text-text-primary font-mono text-[10px] outline-none"
									>
										<option value="max_completion_tokens">
											max_completion_tokens
										</option>
										<option value="max_tokens">max_tokens</option>
									</select>
								)}
								<button
									type="button"
									data-testid={`settings-delete-model-${model.id}`}
									onClick={() => deleteModel(editing, model.id)}
									class="text-xs text-error cursor-pointer px-xs"
								>
									Delete
								</button>
							</div>
						))}
					</div>
				</div>

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
										{p.providerId} ·{" "}
										{p.models.find((m) => m.id === p.defaultModelId)?.model ??
											p.models[0]?.model ??
											"(no model)"}
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
					onClick={() => addProvider(ProviderId.Anthropic)}
					class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary"
				>
					+ Anthropic
				</button>
				<button
					type="button"
					data-testid="settings-add-openai"
					onClick={() => addProvider(ProviderId.OpenAI)}
					class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary"
				>
					+ OpenAI (Chat Completions)
				</button>
				<button
					type="button"
					data-testid="settings-add-deepseek"
					onClick={() => addProvider(ProviderId.DeepSeek)}
					class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary"
				>
					+ DeepSeek
				</button>
				<button
					type="button"
					data-testid="settings-add-openai-compatible"
					onClick={() => addProvider(ProviderId.Custom)}
					class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary"
				>
					+ OpenAI-compatible (Chat Completions)
				</button>
				<button
					type="button"
					data-testid="settings-add-anthropic-compatible"
					onClick={() =>
						addProvider(ProviderId.Custom, WireFormat.AnthropicMessages)
					}
					class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer bg-bg-surface-solid text-text-secondary border border-border-strong hover:text-text-primary"
				>
					+ Anthropic-compatible
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
