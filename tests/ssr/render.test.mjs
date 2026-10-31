import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { startFixture } from "./fixture.mjs";

let fixture, app, origin;
before(async () => {
	fixture = await startFixture();
	app = spawn(process.execPath, ["dist/server/entry.mjs"], {
		env: {
			...process.env,
			HOST: "127.0.0.1",
			PORT: "0",
			VITE_CONVEX_URL: fixture.origin,
			VITE_CONVEX_SITE_URL: fixture.origin,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	origin = await new Promise((resolve, reject) => {
		let output = "";
		const timer = setTimeout(
			() => reject(new Error(`Server did not start: ${output}`)),
			10000,
		);
		app.stdout.on("data", (chunk) => {
			output += chunk;
			const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
			if (match) {
				clearTimeout(timer);
				resolve(match[0]);
			}
		});
		app.stderr.on("data", (chunk) => {
			output += chunk;
		});
		app.on("exit", (code) => {
			clearTimeout(timer);
			reject(new Error(`Server exited ${code}: ${output}`));
		});
	});
});
after(async () => {
	if (app) {
		app.kill();
		await once(app, "exit");
	}
	if (fixture) await fixture.close();
});
const page = async (query = "", user = "alice") => {
	const response = await fetch(`${origin}/${query}`, {
		headers: user ? { cookie: `better-auth.session_token=${user}` } : {},
	});
	return { response, html: await response.text() };
};
test("Astro returns real login, reset and onboarding forms before JavaScript", async () => {
	for (const [query, label] of [
		["", "Sign in"],
		["?auth=register", "Create your account"],
		["?auth=request", "Send reset link"],
		["?token=reset-token", "Choose a new password"],
	]) {
		const { response, html } = await page(query, "");
		assert.equal(response.status, 200);
		assert.ok(html.includes(label));
		assert.doesNotMatch(html, /<astro-island/);
	}
	const { html } = await page("", "new");
	assert.ok(html.includes("Create my private budget"));
});
test("each signed-in view is rendered on the server with its complete controls", async () => {
	const cases = {
		overview: [
			"Category balances",
			"Spending over time",
			"Recurring-charge suggestions",
			"budgets:setRecurring",
		],
		transactions: [
			"Search transactions",
			"Manage categories",
			"Add transaction",
			"Next page",
		],
		budget: [
			"Expected take-home income",
			"Save budget",
			"Personal budget funding",
			"personalAllocations:save",
		],
		review: ["Complete monthly review", "Add allocation", "budgets:review"],
		accounts: [
			"Connect a bank",
			"Save account name",
			"Confirm account move",
			"Leave shared budget",
			"Send invitation",
			"bank:sync",
		],
		profile: ["Save profile", "Current password", "New password"],
	};
	for (const [view, labels] of Object.entries(cases)) {
		const { response, html } = await page(
			`?space=shared&month=2026-10&view=${view}`,
		);
		assert.equal(response.status, 200, view);
		for (const label of labels)
			assert.ok(html.includes(label), `${view}: ${label}`);
		assert.equal(response.headers.get("cache-control"), "private, no-store");
		assert.match(response.headers.get("vary"), /Cookie/i);
		assert.doesNotMatch(html, /<astro-island|Bearer alice|"token":"alice"/);
	}
});
test("transaction, category and duplicate-account editors render their revision and actions", async () => {
	for (const [query, labels] of [
		[
			"view=transactions&edit=manual",
			[
				"Category splits",
				"Match entries",
				"Delete manual entry",
				"revision&quot;:4",
			],
		],
		[
			"view=transactions&edit=imported",
			["Imported amount, date and pending status", "readonly"],
		],
		[
			"view=transactions&categoryEdit=food",
			["Delete and reassign", "replacementId", "revision&quot;:2"],
		],
		[
			"view=accounts&bankReview=review-bank",
			["Same account", "Different account", "Confirm accounts"],
		],
		[
			"view=accounts&space=alice-private",
			["contributions:savePlanned", "Confirm match", "Remove match"],
		],
	]) {
		const { response, html } = await page(`?month=2026-10&${query}`);
		assert.equal(response.status, 200);
		for (const label of labels) assert.ok(html.includes(label), label);
	}
});
test("private responses are isolated between users and HTML data is escaped", async () => {
	const [alice, bob] = await Promise.all([
		page("?view=profile", "alice"),
		page("?view=profile", "bob"),
	]);
	assert.ok(alice.html.includes("alice@example.com"));
	assert.ok(!alice.html.includes("bob@example.com"));
	assert.ok(bob.html.includes("bob@example.com"));
	assert.ok(!bob.html.includes("alice@example.com"));
	const { html } = await page("?view=transactions");
	assert.ok(html.includes("&lt;script&gt;"));
	assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
	const state = JSON.parse(
		/<script type="application\/json" id="page-state">(.*?)<\/script>/s.exec(
			html,
		)[1],
	);
	assert.ok(state.watches.length > 0);
});
test("filters, historical read access, expired sessions and missing pages retain their behavior", async () => {
	const filtered = await page("?view=transactions&search=no-match");
	assert.ok(filtered.html.includes("No transactions match these filters."));
	const left = await page("?space=left&view=budget");
	assert.ok(left.html.includes("You left this budget"));
	assert.match(left.html, /<fieldset disabled/);
	const expired = await page("", "expired");
	assert.ok(expired.html.includes("Sign in"));
	const missing = await fetch(`${origin}/missing`);
	assert.equal(missing.status, 404);
	assert.ok((await missing.text()).includes("Page not found"));
});
test("the Astro API route preserves POST bodies and both auth cookies", async () => {
	const response = await fetch(`${origin}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "content-type": "application/json", origin },
		body: JSON.stringify({
			email: "alice@example.com",
			password: "fixture-password",
		}),
	});
	assert.equal(response.status, 200);
	assert.equal(response.headers.getSetCookie().length, 2);
	const forwarded = fixture.calls.findLast(
		(c) => c.path === "/api/auth/sign-in/email",
	);
	assert.equal(JSON.parse(forwarded.body).email, "alice@example.com");
	assert.equal(
		forwarded.headers["x-better-auth-forwarded-host"],
		new URL(origin).host,
	);
});
