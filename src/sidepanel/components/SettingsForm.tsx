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
		<div
			style={{
				padding: "8px 12px",
				borderBottom: "1px solid #e0e0e0",
				background: "#f8f8f8",
				position: "relative",
				zIndex: 102,
			}}
		>
			<div style={{ display: "grid", gap: "8px" }}>
				<label>
					<span style={{ display: "block", marginBottom: "4px" }}>
						Anthropic API Key:
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
						style={{
							width: "100%",
							padding: "4px 8px",
							border: "1px solid #ccc",
							borderRadius: "4px",
						}}
					/>
				</label>
				<label>
					<span style={{ display: "block", marginBottom: "4px" }}>
						Base URL:
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
						style={{
							width: "100%",
							padding: "4px 8px",
							border: "1px solid #ccc",
							borderRadius: "4px",
						}}
					/>
				</label>
				<label>
					<span style={{ display: "block", marginBottom: "4px" }}>Model:</span>
					<input
						type="text"
						value={model}
						onInput={(e) => {
							const val = (e.target as HTMLInputElement).value;
							browsergentStore.getState().settingsDraftChanged({
								model: val,
							});
						}}
						style={{
							width: "100%",
							padding: "4px 8px",
							border: "1px solid #ccc",
							borderRadius: "4px",
						}}
					/>
				</label>
				<button
					type="button"
					onClick={onSave}
					style={{
						padding: "4px 12px",
						background: "#4a90d9",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: "pointer",
					}}
				>
					Save
				</button>
				<button
					type="button"
					onClick={onExport}
					style={{
						padding: "4px 12px",
						background: "#666",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: "pointer",
					}}
				>
					Export conversation
				</button>
			</div>
		</div>
	);
};
