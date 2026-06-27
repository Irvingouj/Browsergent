import type { SkillMeta } from "./skill-types";

/**
 * Glob-style URL matcher for environmental skill activation.
 *
 * `*` matches any sequence (incl. `/`), `?` matches one char, everything else
 * is literal. Case-insensitive, matched against the full URL
 * (protocol + host + path + query).
 */
export function matchSkillsToUrl(
	skills: ReadonlyArray<SkillMeta>,
	url: string,
): SkillMeta[] {
	return skills.filter((s) => s.match !== undefined && globMatch(s.match, url));
}

export function globMatch(pattern: string, url: string): boolean {
	// Anchor the domain to a host boundary so "linkedin.com/jobs/*" cannot
	// match the same substring in a path of an unrelated host
	// ("https://evil.com/linkedin.com/x"). The host must begin right after
	// "://" (optionally "www." or a subdomain), or at the start of the string.
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*")
		.replace(/\?/g, ".");
	// `?` is a single-char glob wildcard; it collides with the URL query
	// separator, so "search?key=*" matches "searchxkey=…". Glob convention
	// wins — authors wanting a literal ? should avoid it.
	const re = new RegExp(`(?:^|://(?:[^/@]*\\.)?)${escaped}`, "i");
	return re.test(url);
}
