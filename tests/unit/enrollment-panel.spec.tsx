import { render } from "preact-render-to-string";
import { describe, expect, test } from "vitest";
import { EnrollmentPanel } from "../../src/sidepanel/components/EnrollmentPanel";

describe("EnrollmentPanel", () => {
	test("shows host down, no token, and CLI not enrolled before Generate", () => {
		const html = render(
			<EnrollmentPanel
				token={null}
				connected={false}
				cliEnrolled={false}
				onGenerate={() => {}}
				onRevoke={() => {}}
			/>,
		);
		expect(html).toContain("enroll-generate");
		expect(html).toContain('data-enroll-host="false"');
		expect(html).toContain('data-enroll-token="false"');
		expect(html).toContain('data-enroll-cli="false"');
		expect(html).toContain("Host not running");
		expect(html).toContain("Token not generated");
		expect(html).toContain("CLI not enrolled");
		expect(html).not.toContain("enroll-revoke");
		expect(html).toContain("npm run bridge -- docs page");
		expect(html).toContain("npm run bridge -- run");
	});

	test("token generated does not claim the CLI is enrolled", () => {
		const html = render(
			<EnrollmentPanel
				token="tok-123"
				connected={true}
				cliEnrolled={false}
				onGenerate={() => {}}
				onRevoke={() => {}}
			/>,
		);
		expect(html).toContain("tok-123");
		expect(html).toContain("enroll-revoke");
		expect(html).toContain('data-enroll-host="true"');
		expect(html).toContain('data-enroll-token="true"');
		expect(html).toContain('data-enroll-cli="false"');
		expect(html).toContain("Host running");
		expect(html).toContain("Token generated");
		expect(html).toContain("CLI not enrolled");
		expect(html).not.toContain("CLI enrolled");
	});

	test("paired CLI is shown as enrolled after a matching CLI request", () => {
		const html = render(
			<EnrollmentPanel
				token="tok-123"
				connected={true}
				cliEnrolled={true}
				onGenerate={() => {}}
				onRevoke={() => {}}
			/>,
		);
		expect(html).toContain('data-enroll-cli="true"');
		expect(html).toContain("CLI enrolled");
	});

	test("Generate is disabled until enrollment storage is ready", () => {
		const html = render(
			<EnrollmentPanel
				token={null}
				connected={true}
				cliEnrolled={false}
				ready={false}
				onGenerate={() => {}}
				onRevoke={() => {}}
			/>,
		);
		expect(html).toContain("enroll-generate");
		expect(html).toMatch(/disabled/);
	});
});
