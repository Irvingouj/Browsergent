import type { FunctionalComponent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ProviderId, WireFormat } from "../../types/messages";

interface AddProviderButtonProps {
	onPick: (providerId: ProviderId, wireFormat?: WireFormat) => void;
}

const OPTIONS = [
	{ id: ProviderId.Anthropic, label: "Anthropic" },
	{ id: ProviderId.OpenAI, label: "OpenAI (Chat Completions)" },
	{ id: ProviderId.DeepSeek, label: "DeepSeek" },
] as const;

const COMPATIBLE_OPTIONS = [
	{
		id: ProviderId.Custom,
		wireFormat: undefined as WireFormat | undefined,
		label: "OpenAI-compatible",
		testId: "settings-add-openai-compatible",
	},
	{
		id: ProviderId.Custom,
		wireFormat: WireFormat.AnthropicMessages,
		label: "Anthropic-compatible",
		testId: "settings-add-anthropic-compatible",
	},
] as const;

export const AddProviderButton: FunctionalComponent<AddProviderButtonProps> = ({
	onPick,
}) => {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent): void => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	return (
		<div ref={containerRef} class="relative">
			<button
				type="button"
				data-testid="settings-add-provider"
				onClick={() => setOpen((v) => !v)}
				class="px-sm py-xs rounded-md font-sans text-xs font-medium cursor-pointer text-accent hover:bg-accent-soft transition-colors"
			>
				+ Provider
			</button>
			{open && (
				<div
					role="menu"
					class="absolute z-20 left-0 mt-xs flex flex-col bg-bg-surface-solid border border-border-strong rounded-lg shadow-lg min-w-52 py-sm overflow-hidden"
				>
					{OPTIONS.map((opt) => (
						<button
							key={opt.label}
							type="button"
							data-testid={`settings-add-${opt.id}`}
							onClick={() => {
								onPick(opt.id);
								setOpen(false);
							}}
							class="text-left px-md py-xs font-sans text-xs text-text-primary hover:bg-bg-muted rounded-md transition-colors"
						>
							{opt.label}
						</button>
					))}
					<div class="h-px bg-border-strong my-xs" />
					{COMPATIBLE_OPTIONS.map((opt) => (
						<button
							key={opt.label}
							type="button"
							data-testid={opt.testId}
							onClick={() => {
								onPick(opt.id, opt.wireFormat);
								setOpen(false);
							}}
							class="text-left px-md py-xs font-sans text-xs text-text-primary hover:bg-bg-muted rounded-md transition-colors"
						>
							{opt.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
};
