import assert from "node:assert/strict";
import test from "node:test";
import { proxyAuth } from "../src/lib/auth";
import { reportingMonth, reportStart } from "../src/lib/bootstrap";
import { loadBudget } from "../src/lib/load-budget";

const config = {
	convexUrl: "https://test.convex.cloud",
	convexSiteUrl: "https://test.convex.site",
};
test("Astro auth proxy forwards the body, cookies, origin, redirects and all set-cookie headers", async () => {
	const request = new Request(
		"https://bakeoff.example/api/auth/sign-in/email?test=1",
		{
			method: "POST",
			body: '{"email":"a@example.com"}',
			headers: {
				cookie: "session=one",
				origin: "https://bakeoff.example",
				"content-type": "application/json",
				"x-better-auth-forwarded-host": "untrusted.example",
				connection: "keep-alive",
			},
		},
	);
	const fetcher: typeof fetch = async (url, init) => {
		assert.equal(
			String(url),
			"https://test.convex.site/api/auth/sign-in/email?test=1",
		);
		assert.equal(init?.redirect, "manual");
		const headers = new Headers(init?.headers);
		assert.equal(headers.get("cookie"), "session=one");
		assert.equal(headers.get("origin"), "https://bakeoff.example");
		assert.equal(
			headers.get("x-better-auth-forwarded-host"),
			"bakeoff.example",
		);
		assert.equal(headers.get("x-better-auth-forwarded-proto"), "https");
		assert.equal(headers.has("connection"), false);
		assert.equal(
			new TextDecoder().decode(init?.body as ArrayBuffer),
			'{"email":"a@example.com"}',
		);
		const outgoing = new Headers({
			location: "/",
			"content-encoding": "gzip",
			"content-length": "200",
		});
		outgoing.append("set-cookie", "one=1; HttpOnly");
		outgoing.append("set-cookie", "two=2; HttpOnly");
		return new Response(null, { status: 302, headers: outgoing });
	};
	const response = await proxyAuth(request, config, fetcher);
	assert.equal(response.status, 302);
	assert.equal(response.headers.get("location"), "/");
	assert.deepEqual(response.headers.getSetCookie(), [
		"one=1; HttpOnly",
		"two=2; HttpOnly",
	]);
	assert.equal(response.headers.get("cache-control"), "private, no-store");
	assert.equal(response.headers.has("content-encoding"), false);
});
test("browser data loading propagates backend errors", async () => {
	await assert.rejects(
		loadBudget(
			new URL("https://app.example/"),
			async () => {
				throw new Error("Backend unavailable");
			},
			config.convexUrl,
		),
		/Backend unavailable/,
	);
});
test("the reporting month uses the budget time zone across UTC boundaries", () => {
	assert.equal(
		reportingMonth("America/Boise", new Date("2026-11-01T02:00:00Z")),
		"2026-10",
	);
	assert.equal(reportStart("2026-02"), "2025-09");
});
