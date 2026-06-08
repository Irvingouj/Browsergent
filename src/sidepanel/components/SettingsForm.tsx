import type { FunctionalComponent } from "preact";
import { useCallback } from "preact/hooks";
import { useStore } from "zustand/react";
import {
	selectApiKey,
	selectBaseUrl,
	selectModel,
} from "../../state/selectors";
import { browsergentStore } from "../../state/store";

interface SettingsFormProps {
	onSave: () => void;
	onExport: () => void;
	onClose: () => void;
}

export const SettingsForm: FunctionalComponent<SettingsFormProps> = ({
	onSave,
	onExport,
	onClose,
}) => {
	const apiKey = useStore(browsergentStore, selectApiKey);
	const baseUrl = useStore(browsergentStore, selectBaseUrl);
	const model = useStore(browsergentStore, selectModel);

	const handleBackdropClick = useCallback(
		(e: MouseEvent) => {
			if (e.target === e.currentTarget) {
				onClose();
			}
		},
		[onClose],
	);

	return (
		<div class="fixed inset-0 z-[102] flex items-center justify-center">
			{/* Backdrop covering entire viewport including session drawer */}
			<div
				class="absolute inset-0 bg-black/20 backdrop-blur-sm animate-fade-in"
				onClick={handleBackdropClick}
			/>
			{/* Modal card */}
			<div class="relative z-[103] w-full max-w-[420px] mx-md p-md bg-bg-surface-solid border border-border-strong rounded-md shadow-lg animate-modal-in">
				<div class="flex items-center justify-between mb-md">
					<span class="text-sm font-semibold text-text-primary">Settings</span>
					<button
						type="button"
						data-testid="close-settings-button"
						aria-label="Close settings"
						onClick={onClose}
						class="flex items-center justify-center w-7 h-7 rounded-md bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all cursor-pointer"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						>
							<path d="M4 4l8 8M12 4l-8 8" />
						</svg>
					</button>
				</div>
				<div class="grid gap-md">
					<label>
						<span class="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-xs">
							Anthropic API Key
						</span>
						<input
							type="password"
							value={apiKey}
							onInput={(e) => {
								const val = (e.target as HTMLInputElement).value;
								browsergentStore.getState().settingsDraftChanged({
									anthropicApiKey: val,
								});
							}}
							class="w-full bg-bg-muted border border-border rounded-md px-md py-sm text-text-primary font-mono text-xs outline-none transition-all focus:border-accent focus:ring-[3px] focus:ring-accent-soft placeholder:text-text-dim"
						/>
					</label>
					<label>
						<span class="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-xs">
							Base URL
						</span>
						<input
							type="text"
							value={baseUrl}
							onInput={(e) => {
								const val = (e.target as HTMLInputElement).value;
								browsergentStore.getState().settingsDraftChanged({
									baseUrl: val,
								});
							}}
							class="w-full bg-bg-muted border border-border rounded-md px-md py-sm text-text-primary font-mono text-xs outline-none transition-all focus:border-accent focus:ring-[3px] focus:ring-accent-soft placeholder:text-text-dim"
						/>
					</label>
					<label>
						<span class="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-xs">
							Model
						</span>
						<input
							type="text"
							value={model}
							onInput={(e) => {
								const val = (e.target as HTMLInputElement).value;
								browsergentStore.getState().settingsDraftChanged({
									model: val,
								});
							}}
							class="w-full bg-bg-muted border border-border rounded-md px-md py-sm text-text-primary font-mono text-xs outline-none transition-all focus:border-accent focus:ring-[3px] focus:ring-accent-soft placeholder:text-text-dim"
						/>
					</label>
					<div class="flex gap-sm mt-sm">
						<button
							type="button"
							data-testid="save-settings-button"
							aria-label="Save settings"
							onClick={onSave}
							class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer transition-all flex items-center gap-xs bg-text-primary text-bg-base hover:bg-text-secondary"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M3 8.5l4 4 6-6" />
							</svg>
							Save
						</button>
						<button
							type="button"
							data-testid="export-button"
							aria-label="Export conversation"
							onClick={onExport}
							class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer transition-all flex items-center gap-xs bg-bg-surface-solid text-text-secondary border border-border-strong hover:border-border-strong hover:text-text-primary"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M8 3v7M4 8l4 4 4-4" />
								<path d="M2 13h12" />
							</svg>
							Export
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};
