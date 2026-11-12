const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];

// Trust exact origins. Loopback aliases keep the configured protocol and port;
// tunnel addresses with a different port must be configured explicitly.
export function trustedAuthOrigins(
	siteUrl: string | undefined,
	additionalOrigins?: string,
): string[] {
	const origins = new Set<string>();
	const urls = [siteUrl, ...(additionalOrigins?.split(",") ?? [])];
	for (const value of urls) {
		if (!value?.trim()) continue;
		const url = new URL(value.trim());
		if (
			!["http:", "https:"].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.hostname.includes("*")
		)
			throw new Error(
				"Auth origins must be HTTP or HTTPS URLs without credentials or wildcards.",
			);
		origins.add(url.origin);
		if (loopbackHosts.includes(url.hostname)) {
			for (const hostname of loopbackHosts) {
				url.hostname = hostname;
				origins.add(url.origin);
			}
		}
	}
	return [...origins];
}
