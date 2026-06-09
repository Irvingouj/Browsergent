import type { FunctionalComponent } from "preact";
import { useEffect, useRef } from "preact/hooks";

export interface CommandPickerItem {
	id: string;
	label: string;
	description: string;
	insertText: string;
}

interface CommandPickerProps {
	items: ReadonlyArray<CommandPickerItem>;
	activeIndex: number;
	onSelect: (item: CommandPickerItem) => void;
	onActiveIndexChange: (index: number) => void;
	onDismiss: () => void;
}

function fuzzyMatch(query: string, label: string, description: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const haystack = `${label} ${description}`.toLowerCase();
	return haystack.includes(q);
}

export function filterPickerItems(
	items: ReadonlyArray<CommandPickerItem>,
	query: string,
): CommandPickerItem[] {
	return items.filter((item) => fuzzyMatch(query, item.label, item.description));
}

export const CommandPicker: FunctionalComponent<CommandPickerProps> = ({
	items,
	activeIndex,
	onSelect,
	onActiveIndexChange,
	onDismiss,
}) => {
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = listRef.current?.querySelector(
			`[data-picker-index="${activeIndex}"]`,
		);
		el?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onDismiss();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onDismiss]);

	if (items.length === 0) return null;

	return (
		<div
			ref={listRef}
			class="command-picker absolute left-0 right-0 bottom-full mb-1 max-h-48 overflow-y-auto rounded-md border border-border bg-bg-surface shadow-lg z-20"
			data-testid="command-picker"
		>
			{items.map((item, index) => (
				<button
					key={item.id}
					type="button"
					data-picker-index={index}
					data-testid={`command-picker-item-${item.id}`}
					class={`command-picker-item w-full text-left px-md py-sm border-0 cursor-pointer ${
						index === activeIndex
							? "bg-accent-soft text-text-primary"
							: "bg-transparent text-text-primary hover:bg-bg-base"
					}`}
					onClick={() => onSelect(item)}
					onMouseEnter={() => onActiveIndexChange(index)}
				>
					<div class="text-sm font-medium">{item.label}</div>
					<div class="text-xs text-text-dim truncate">{item.description}</div>
				</button>
			))}
		</div>
	);
};
