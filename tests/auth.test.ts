import assert from "node:assert/strict";
import test from "node:test";
import { trustedAuthOrigins } from "../convex/authOrigins";

test("local auth accepts both loopback addresses on the configured port", () => {
	assert.deepEqual(trustedAuthOrigins("http://localhost:3000"), [
		"http://localhost:3000",
		"http://127.0.0.1:3000",
	]);
	assert.deepEqual(trustedAuthOrigins("http://127.0.0.1:4000/"), [
		"http://127.0.0.1:4000",
		"http://localhost:4000",
	]);
});

test("local auth preserves the configured protocol", () => {
	assert.deepEqual(trustedAuthOrigins("https://localhost:3000"), [
		"https://localhost:3000",
		"https://127.0.0.1:3000",
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
