import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { start } from "../../server/index.ts";

test("production serves a client shell and real assets without a rendering framework or private data", async () => {
	const app = await start({ port: 0, database: ":memory:", jobs: false });
	const address = app.server.address();
	const base = `http://localhost:${address.port}`;
	try {
		const anonymous = await fetch(base);
		assert.equal(anonymous.status, 200);
		const html = await anonymous.text();
		assert.match(html, /<div id="app"><\/div>/);
		assert.doesNotMatch(
			html,
			/<form|<template|convex|astro|react|password|email/i,
		);
		const other = await fetch(base, {
			headers: { Cookie: "budget_session=forged" },
		});
		assert.equal(await other.text(), html);
		// Vite emits root-relative asset URLs.
		const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
			(m) => m[1],
		);
		assert.ok(assets.length >= 2);
		for (const path of assets) {
			const response = await fetch(base + path);
			assert.equal(response.status, 200);
			assert.match(response.headers.get("cache-control"), /immutable/);
			if (path.endsWith(".js"))
				assert.match(response.headers.get("content-type"), /javascript/);
			else assert.match(response.headers.get("content-type"), /css/);
		}
		assert.equal((await fetch(base + "/missing.js")).status, 404);
		const privateRead = await fetch(base + "/api/me/budgets");
		assert.equal(privateRead.status, 401);
		assert.equal(privateRead.headers.get("cache-control"), "no-store");
		assert.equal((await fetch(base + "/server/auth.ts")).status, 404);
		const bundle = (
			await Promise.all(
				assets
					.filter((p) => p.endsWith(".js"))
					.map((p) => fetch(base + p).then((r) => r.text())),
			)
		).join("");
		assert.doesNotMatch(
			bundle,
			/provider-access-secret|PLAID_SECRET|RESEND_API_KEY|better-auth|convex\.cloud/,
		);
		assert.match(await readFile("index.html", "utf8"), /src\/scripts\/app\.ts/);
	} finally {
		await app.close();
	}
});
