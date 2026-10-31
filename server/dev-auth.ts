import type { Plugin } from "vite";
import { proxyAuth } from "../src/lib/auth";

// Development API middleware. It is never included in the static page build.
export function devAuthProxy(env: Record<string, string>): Plugin {
	return {
		name: "budget-auth-api",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use(async (request, response, next) => {
				if (!request.url?.startsWith("/api/auth/")) return next();
				if (!env.VITE_CONVEX_URL || !env.VITE_CONVEX_SITE_URL) {
					response.writeHead(503, { "content-type": "application/json" });
					response.end(
						JSON.stringify({ message: "Authentication is not configured." }),
					);
					return;
				}
				try {
					const headers = new Headers();
					for (const [key, value] of Object.entries(request.headers)) {
						if (Array.isArray(value))
							for (const item of value) headers.append(key, item);
						else if (value !== undefined) headers.set(key, value);
					}
					const chunks: Uint8Array[] = [];
					for await (const chunk of request) chunks.push(chunk);
					const method = request.method ?? "GET";
					const url = new URL(
						request.url,
						`http://${request.headers.host ?? "localhost:3000"}`,
					);
					const result = await proxyAuth(
						new Request(url, {
							method,
							headers,
							body: ["GET", "HEAD"].includes(method)
								? undefined
								: Buffer.concat(chunks),
						}),
						{
							convexUrl: env.VITE_CONVEX_URL,
							convexSiteUrl: env.VITE_CONVEX_SITE_URL,
						},
					);
					response.statusCode = result.status;
					result.headers.forEach((value, key) => {
						if (key !== "set-cookie") response.setHeader(key, value);
					});
					const cookies = result.headers.getSetCookie();
					if (cookies.length) response.setHeader("set-cookie", cookies);
					response.end(Buffer.from(await result.arrayBuffer()));
				} catch {
					response.writeHead(502, { "content-type": "application/json" });
					response.end(
						JSON.stringify({
							message: "Authentication is temporarily unavailable.",
						}),
					);
				}
			});
		},
	};
}
