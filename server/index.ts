import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { routes } from "../src/shared/routes.ts";
import { Auth } from "./auth.ts";
import { trustedAuthOrigins } from "./features/authOrigins.ts";
import { verifyWebhook } from "./features/plaidClient.ts";
import { Runtime } from "./runtime.ts";
import { Store } from "./store.ts";

export async function start(
	options: {
		port?: number;
		database?: string;
		development?: boolean;
		jobs?: boolean;
	} = {},
) {
	const port = options.port ?? Number(process.env.PORT ?? 3003);
	process.env.SITE_URL ??= `http://localhost:${port}`;
	const database =
		options.database ?? process.env.DATABASE_PATH ?? "./data/bakeoff-3.sqlite";
	if (database !== ":memory:")
		mkdirSync(dirname(resolve(database)), { recursive: true, mode: 0o700 });
	const store = new Store(database);
	const runtime = new Runtime(store);
	const auth = new Auth(runtime);
	const vite = options.development
		? await (await import("vite")).createServer({
				server: { middlewareMode: true },
				appType: "spa",
			})
		: undefined;
	const publicRoutes = new Map(
		Object.entries(routes).map(([key, [method, path]]) => [
			`${method} ${path}`,
			key,
		]),
	);
	async function body(req: IncomingMessage) {
		const chunks: Buffer[] = [];
		let length = 0;
		for await (const chunk of req) {
			length += chunk.length;
			if (length > 1000000) throw new Error("Request is too large.");
			chunks.push(chunk);
		}
		return Buffer.concat(chunks).toString("utf8");
	}
	const server = createServer(async (req, res) => {
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader("Referrer-Policy", "same-origin");
		const url = new URL(req.url ?? "/", process.env.SITE_URL);
		if (url.pathname.startsWith("/api/") || url.pathname === "/bank-events") {
			res.setHeader("Content-Type", "application/json");
			res.setHeader("Cache-Control", "no-store");
			try {
				const method = req.method ?? "GET";
				if (url.pathname === "/bank-events" && method === "POST") {
					const raw = await body(req);
					await verifyWebhook(
						String(req.headers["plaid-verification"] ?? ""),
						raw,
					);
					const event = JSON.parse(raw);
					if (
						typeof event.item_id === "string" &&
						["TRANSACTIONS", "ITEM"].includes(event.webhook_type)
					)
						await runtime.invoke(
							"bank:event",
							{
								itemId: event.item_id,
								...(event.error?.error_code
									? { error: String(event.error.error_code) }
									: {}),
							},
							undefined,
							true,
						);
					res.end("{}");
					return;
				}
				if (method !== "GET") {
					if (
						!trustedAuthOrigins(
							process.env.SITE_URL,
							process.env.AUTH_TRUSTED_ORIGINS,
						).includes(req.headers.origin ?? "")
					) {
						res.statusCode = 403;
						throw new Error("Request origin is not allowed.");
					}
					if (!req.headers["content-type"]?.startsWith("application/json"))
						throw new Error("Send a JSON request.");
				}
				const args =
					method === "GET"
						? Object.fromEntries(url.searchParams)
						: JSON.parse(await body(req));
				let result: unknown;
				if (url.pathname.startsWith("/api/auth/")) {
					const path = url.pathname.slice("/api/auth/".length);
					if (
						!(
							(path === "session" && method === "GET") ||
							([
								"register",
								"login",
								"logout",
								"request-password-reset",
								"reset-password",
								"change-password",
								"update-user",
							].includes(path) &&
								method === "POST")
						)
					) {
						res.statusCode = 404;
						throw new Error("Route not found.");
					}
					result = await auth.handle(path, args, req, res);
				} else {
					const operation = publicRoutes.get(`${method} ${url.pathname}`);
					if (!operation) {
						res.statusCode = 404;
						throw new Error("Route not found.");
					}
					const user = await auth.user(req);
					if (!user) {
						res.statusCode = 401;
						throw new Error("Sign in to continue.");
					}
					// Query parameters are strings; only the transaction page size is numeric.
					if ("limit" in args && method === "GET")
						args.limit = Number(args.limit);
					result = await runtime.invoke(operation, args, user);
				}
				res.end(JSON.stringify(result ?? null));
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "The request failed.";
				if (res.statusCode < 400)
					res.statusCode = /do not have access|not yours|not own/.test(message)
						? 403
						: /changed|revision|outdated/.test(message)
							? 409
							: 400;
				res.end(JSON.stringify({ error: message }));
			}
			return;
		}
		if (vite) {
			vite.middlewares(req, res);
			return;
		}
		try {
			const root = resolve("dist");
			const requested = resolve(root, `.${decodeURIComponent(url.pathname)}`);
			if (!requested.startsWith(root + sep) && requested !== root) {
				res.writeHead(404).end();
				return;
			}
			const file = extname(requested) ? requested : resolve(root, "index.html");
			const content = await readFile(file);
			res.setHeader(
				"Content-Type",
				(
					{
						".html": "text/html; charset=utf-8",
						".js": "text/javascript; charset=utf-8",
						".css": "text/css; charset=utf-8",
						".svg": "image/svg+xml",
						".png": "image/png",
						".woff2": "font/woff2",
					} as Record<string, string>
				)[extname(file)] ?? "application/octet-stream",
			);
			res.setHeader(
				"Cache-Control",
				file.includes("/assets/")
					? "public, max-age=31536000, immutable"
					: "no-cache",
			);
			res.end(content);
		} catch {
			res.writeHead(404).end("Page not found.");
		}
	});
	await new Promise<void>((done, fail) => {
		server.once("error", fail);
		server.listen(port, "0.0.0.0", done);
	});
	let timer: ReturnType<typeof setInterval> | undefined;
	let poll: ReturnType<typeof setInterval> | undefined;
	if (options.jobs !== false) {
		void runtime.invoke("bank:poll", {}, undefined, true).catch(() => {});
		timer = setInterval(() => {
			void runtime.drainJobs();
		}, 1000);
		timer.unref();
		poll = setInterval(() => {
			void runtime.invoke("bank:poll", {}, undefined, true).catch(() => {});
		}, 6 * 3600000);
		poll.unref();
	}
	return {
		server,
		store,
		runtime,
		close: async () => {
			if (timer) clearInterval(timer);
			if (poll) clearInterval(poll);
			await vite?.close();
			await new Promise<void>((done, fail) =>
				server.close((e) => (e ? fail(e) : done())),
			);
			store.close();
		},
	};
}
if (
	process.argv[1] &&
	resolve(process.argv[1]) === resolve(import.meta.filename)
) {
	const app = await start({ development: process.argv.includes("--dev") });
	console.log(`Budget Together: ${process.env.SITE_URL}`);
	for (const signal of ["SIGINT", "SIGTERM"] as const)
		process.on(signal, () => {
			void app.close().then(() => process.exit(0));
		});
}
