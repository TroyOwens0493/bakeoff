// Local browser previews can use either loopback address. Keep the protocol
// and port fixed, and do not extend the allowed origins for hosted sites.
export function trustedAuthOrigins(siteUrl: string | undefined): string[] {
	if (!siteUrl) return [];
	const url = new URL(siteUrl);
	const origins = [url.origin];
	if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
		url.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
		origins.push(url.origin);
	}
	return origins;
}
