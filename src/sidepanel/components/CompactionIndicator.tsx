/** In-progress compaction marker. Pi shows a spinner plus "Compacting context...". */
export function CompactionIndicator() {
	return (
		<span
			class="inline-flex items-center gap-1 normal-case tracking-normal text-accent"
			data-testid="compaction-indicator"
			role="status"
			aria-live="polite"
		>
			<svg
				class="animate-spin shrink-0"
				width="12"
				height="12"
				viewBox="0 0 16 16"
				fill="none"
				aria-hidden="true"
			>
				<circle
					cx="8"
					cy="8"
					r="6"
					stroke="currentColor"
					strokeWidth="2"
					strokeDasharray="10 6"
					strokeLinecap="round"
				/>
			</svg>
			<span>
				Compacting context
				<span class="compaction-ellipsis" aria-hidden="true" />
			</span>
		</span>
	);
}
