export type BackendConfig = { convexUrl: string; convexSiteUrl: string };

export function backendConfig(): BackendConfig | null {
	const convexUrl = process.env.VITE_CONVEX_URL;
	const convexSiteUrl = process.env.VITE_CONVEX_SITE_URL;
	return convexUrl && convexSiteUrl ? { convexUrl, convexSiteUrl } : null;
}

export async function proxyAuth(
	request: Request,
	config: BackendConfig,
	fetcher: typeof fetch = fetch,
) {
	const url = new URL(request.url);
	const target = new URL(`${url.pathname}${url.search}`, config.convexSiteUrl);
	const headers = new Headers(request.headers);
	for (const name of ["connection", "content-length", "transfer-encoding"])
		headers.delete(name);
	headers.set("accept-encoding", "identity");
	headers.set("host", target.host);
	headers.set("x-forwarded-host", url.host);
	headers.set("x-forwarded-proto", url.protocol.slice(0, -1));
	headers.set("x-better-auth-forwarded-host", url.host);
	headers.set("x-better-auth-forwarded-proto", url.protocol.slice(0, -1));
	const response = await fetcher(target, {
		method: request.method,
		headers,
		redirect: "manual",
		body:
			request.method === "GET" || request.method === "HEAD"
				? undefined
				: await request.arrayBuffer(),
	});
	const outgoing = new Headers(response.headers);
	// Fetch decodes compressed bodies; the old length and encoding no longer apply.
	outgoing.delete("content-encoding");
	outgoing.delete("content-length");
	outgoing.set("cache-control", "private, no-store");
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: outgoing,
	});
}
