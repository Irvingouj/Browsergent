import type { FunctionalComponent } from "preact";

interface EnrollmentPanelProps {
	token: string | null;
	connected: boolean;
	cliEnrolled: boolean;
	ready?: boolean;
	onGenerate: () => void;
	onRevoke: () => void;
}

function StatusRow(props: {
	testId: string;
	ok: boolean;
	okLabel: string;
	offLabel: string;
}) {
	return (
		<div
			data-testid={props.testId}
			data-ok={props.ok ? "true" : "false"}
			class="flex items-center justify-between gap-md py-sm border-b border-border last:border-b-0"
		>
			<span class="text-sm text-text-secondary">
				{props.ok ? props.okLabel : props.offLabel}
			</span>
			<span
				class={[
					"text-[10px] font-mono uppercase tracking-wider",
					props.ok ? "text-accent" : "text-text-dim",
				].join(" ")}
			>
				{props.ok ? "yes" : "no"}
			</span>
		</div>
	);
}

export const EnrollmentPanel: FunctionalComponent<EnrollmentPanelProps> = ({
	token,
	connected,
	cliEnrolled,
	ready = true,
	onGenerate,
	onRevoke,
}) => {
	const hasToken = token !== null;
	return (
		<div class="flex flex-1 flex-col items-stretch gap-md p-md">
			<div
				data-testid="enroll-status"
				data-enroll-host={connected ? "true" : "false"}
				data-enroll-token={hasToken ? "true" : "false"}
				data-enroll-cli={cliEnrolled ? "true" : "false"}
				data-enroll-connected={connected ? "true" : "false"}
				class="rounded-md border border-border bg-bg-surface px-md"
			>
				<StatusRow
					testId="enroll-host"
					ok={connected}
					okLabel="Host running"
					offLabel="Host not running"
				/>
				<StatusRow
					testId="enroll-token-status"
					ok={hasToken}
					okLabel="Token generated"
					offLabel="Token not generated"
				/>
				<StatusRow
					testId="enroll-cli"
					ok={cliEnrolled}
					okLabel="CLI enrolled"
					offLabel="CLI not enrolled"
				/>
			</div>

			{hasToken ? (
				<code
					data-testid="enroll-token"
					class="block w-full break-all rounded-md bg-bg-muted px-md py-sm font-mono text-xs text-text-primary"
				>
					{token}
				</code>
			) : (
				<p class="text-sm text-text-secondary">
					Generate a token, then pass it to the local CLI with
					<code> browsergent enroll &lt;token&gt;</code>.
				</p>
			)}

			<div
				data-testid="enroll-help"
				class="rounded-md border border-border bg-bg-muted px-md py-sm text-xs text-text-secondary font-mono whitespace-pre-wrap"
			>
				{`cd ~/code/Browsergent
npm run host
npm run bridge -- enroll <token>
npm run bridge -- docs page
npm run bridge -- run 'await page.snapshot()'
npm run bridge -- write /notes.md hello`}
			</div>

			{hasToken ? (
				<button
					type="button"
					data-testid="enroll-revoke"
					onClick={onRevoke}
					class="self-start px-md py-sm rounded-md border border-border text-sm text-text-secondary hover:text-text-primary cursor-pointer"
				>
					Revoke
				</button>
			) : (
				<button
					type="button"
					data-testid="enroll-generate"
					disabled={!ready}
					onClick={onGenerate}
					class="self-start px-md py-sm rounded-md bg-text-primary text-bg-base text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Generate
				</button>
			)}
		</div>
	);
};
