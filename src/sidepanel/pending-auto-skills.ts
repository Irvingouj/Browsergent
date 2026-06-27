/**
 * In-memory staging for environmental skills that matched while the agent was
 * idle. They're merged into the next run's activatedSkills in handleRun.
 */
const _pending = new Set<string>();

export function addPendingAutoSkill(name: string): void {
	_pending.add(name);
}

export function drainPendingAutoSkills(): string[] {
	const result = Array.from(_pending);
	_pending.clear();
	return result;
}

export function clearPendingAutoSkills(): void {
	_pending.clear();
}
