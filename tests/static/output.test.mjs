import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

let server, origin;
const index = await readFile(
	new URL("../../dist/index.html", import.meta.url),
	"utf8",
);
before(async () => {
	server = createServer(async (req, res) => {
		try {
			const file =
				new URL(req.url, "http://static").pathname === "/"
					? "index.html"
					: "404.html";
			res.statusCode = file === "404.html" ? 404 : 200;
			res.setHeader("content-type", "text/html");
			res.end(await readFile(new URL(`../../dist/${file}`, import.meta.url)));
		} catch {
			res.statusCode = 500;
			res.end();
		}
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
	await new Promise((resolve) => server.close(resolve));
});
test("Astro emits static HTML with no page server or user snapshots", async () => {
	await access(new URL("../../dist/index.html", import.meta.url));
	await access(new URL("../../dist/404.html", import.meta.url));
	await assert.rejects(access(new URL("../../dist/server", import.meta.url)));
	assert.doesNotMatch(
		index,
		/page-state|Bearer |alice@example\.com|bob@example\.com|<astro-island/,
	);
	assert.ok(index.includes('data-auth="login"'));
	assert.ok(index.includes('id="budget-shell"'));
	const files = await readdir(new URL("../../dist/", import.meta.url));
	assert.ok(files.every((name) => !name.includes("server")));
});
test("all visitors receive the same prebuilt public HTML", async () => {
	const publicResponse = await fetch(origin);
	const privateResponse = await fetch(origin, {
		headers: { cookie: "better-auth.session_token=private-user" },
	});
	assert.equal(publicResponse.status, 200);
	assert.equal(privateResponse.status, 200);
	assert.equal(await publicResponse.text(), index);
	assert.equal(await privateResponse.text(), index);
});
test("build output contains all native forms and view templates", () => {
	for (const id of [
		"auth-login",
		"auth-register",
		"auth-request",
		"auth-reset",
		"onboarding",
		"budget-shell",
		"view-overview",
		"view-budget",
		"view-review",
		"view-transactions",
		"editor-transaction",
		"editor-category",
		"view-accounts",
		"view-contributions",
		"view-profile",
	])
		assert.ok(index.includes(`id="${id}"`), id);
	for (const label of [
		"Create account",
		"Sign in",
		"Sign out",
		"Save budget",
		"Add allocation",
		"Save transaction",
		"Delete and reassign",
		"Confirm accounts",
		"Save profile",
	])
		assert.ok(index.includes(label), label);
	assert.ok(index.includes("Enable JavaScript"));
});
test("unknown static paths return the built 404 page", async () => {
	const response = await fetch(`${origin}/missing`);
	assert.equal(response.status, 404);
	assert.ok((await response.text()).includes("Page not found"));
});
