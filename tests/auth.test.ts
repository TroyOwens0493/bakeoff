import assert from "node:assert/strict";
import test from "node:test";
import { trustedAuthOrigins } from "../convex/authOrigins";

test("local auth accepts all loopback addresses on the configured port", () => {
	assert.deepEqual(trustedAuthOrigins("http://localhost:3000"), [
		"http://localhost:3000",
		"http://127.0.0.1:3000",
		"http://[::1]:3000",
	]);
	assert.deepEqual(trustedAuthOrigins("http://127.0.0.1:4000/"), [
		"http://127.0.0.1:4000",
		"http://localhost:4000",
		"http://[::1]:4000",
	]);
	assert.deepEqual(trustedAuthOrigins("http://[::1]:3000"), [
		"http://[::1]:3000",
		"http://localhost:3000",
		"http://127.0.0.1:3000",
	]);
});

test("local auth preserves the configured protocol", () => {
	assert.deepEqual(trustedAuthOrigins("https://localhost:3000"), [
		"https://localhost:3000",
		"https://127.0.0.1:3000",
		"https://[::1]:3000",
	]);
});

test("hosted auth trusts only its configured origin", () => {
	for (const siteUrl of [
		"https://budget.example.com/",
		"https://localhost.example.com",
		"https://127.0.0.1.example.com",
	]) {
		assert.deepEqual(trustedAuthOrigins(siteUrl), [new URL(siteUrl).origin]);
	}
	assert.deepEqual(trustedAuthOrigins(undefined), []);
});

test("auth accepts explicitly configured tunnel ports and removes duplicates", () => {
	assert.deepEqual(
		trustedAuthOrigins(
			"http://localhost:3000",
			" http://localhost:4000/, ,http://127.0.0.1:3000,http://localhost:4000 ",
		),
		[
			"http://localhost:3000",
			"http://127.0.0.1:3000",
			"http://[::1]:3000",
			"http://localhost:4000",
			"http://127.0.0.1:4000",
			"http://[::1]:4000",
		],
	);
});

test("extra hosted origins do not implicitly allow local addresses", () => {
	assert.deepEqual(
		trustedAuthOrigins(
			"https://budget.example.com",
			"https://preview.example.com/",
		),
		["https://budget.example.com", "https://preview.example.com"],
	);
});

test("auth origin configuration rejects invalid URLs and broad trust rules", () => {
	for (const value of [
		"localhost:4000",
		"*",
		"https://*.example.com",
		"file:///tmp/site",
		"https://user:password@example.com",
		"null",
	]) {
		assert.throws(() => trustedAuthOrigins("http://localhost:3000", value));
		assert.throws(() => trustedAuthOrigins(value));
	}
});
