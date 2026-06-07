import type { FunctionalComponent } from "preact";
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
}

export const SettingsForm: FunctionalComponent<SettingsFormProps> = ({
	onSave,
	onExport,
}) => {
	const apiKey = useStore(browsergentStore, selectApiKey);
	const baseUrl = useStore(browsergentStore, selectBaseUrl);
	const model = useStore(browsergentStore, selectModel);

	return (
		<div class="relative z-10 p-md bg-bg-surface border-b border-border animate-panel-in">
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
						class="w-full bg-bg-base border border-border-strong rounded-md px-sm py-xs text-text-primary font-mono text-xs outline-none transition-all focus:border-accent focus:ring-[2px] focus:ring-accent-soft placeholder:text-text-dim"
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
						class="w-full bg-bg-base border border-border-strong rounded-md px-sm py-xs text-text-primary font-mono text-xs outline-none transition-all focus:border-accent focus:ring-[2px] focus:ring-accent-soft placeholder:text-text-dim"
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
						class="w-full bg-bg-base border border-border-strong rounded-md px-sm py-xs text-text-primary font-mono text-xs outline-none transition-all focus:border-accent focus:ring-[2px] focus:ring-accent-soft placeholder:text-text-dim"
					/>
				</label>
				<div class="flex gap-sm mt-sm">
					<button
						type="button"
						onClick={onSave}
						class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer transition-all flex items-center gap-xs bg-text-primary text-bg-base hover:bg-text-secondary"
					>
						Save
					</button>
					<button
						type="button"
						onClick={onExport}
						class="px-sm py-xs rounded-full font-sans text-xs font-semibold cursor-pointer transition-all flex items-center gap-xs bg-bg-surface-solid text-text-secondary border border-border-strong hover:border-border-strong hover:text-text-primary"
					>
						Export conversation
					</button>
				</div>
			</div>
		</div>
	);
};
