/** Run with: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs pnpm test:browser
 * Browser launch is headed by default. On a locked host, use a separate private display.
 * No real bank/email calls. The suite owns an isolated SQLite database and HTTP server.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { start } from "../../server/index.ts";

const { chromium } = await import(
	process.env.PLAYWRIGHT_MODULE || "playwright"
);
const app = await start({ port: 0, database: ":memory:", jobs: false });
const base = `http://localhost:${app.server.address().port}`;
process.env.SITE_URL = base;
process.env.RESEND_API_KEY = "browser-fixture";
process.env.RESEND_FROM = "Budget <budget@example.test>";
const realFetch = globalThis.fetch;
const emails = [];
globalThis.fetch = async (input, options) => {
	if (String(input) === "https://api.resend.com/emails") {
		emails.push(JSON.parse(String(options.body)));
		return Response.json({ id: "fixture" });
	}
	if (new URL(String(input)).hostname.includes("plaid.com"))
		throw new Error("Live provider IO is forbidden in browser tests.");
	return realFetch(input, options);
};
const browser = await chromium.launch({
	headless: process.env.HEADLESS === "1",
	...(process.env.BROWSER_EXECUTABLE
		? { executablePath: process.env.BROWSER_EXECUTABLE }
		: {}),
});
const context = await browser.newContext({
	baseURL: base,
	viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on("dialog", (dialog) => dialog.accept());
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const results = [];
await mkdir("output/browser", { recursive: true });
await context.tracing.start({ screenshots: true, snapshots: true });
async function step(name, work) {
	try {
		await work();
		results.push({ name, status: "passed" });
		console.log("PASS", name);
	} catch (error) {
		results.push({ name, status: "failed", error: String(error) });
		await page.screenshot({
			path: "output/browser/failure.png",
			fullPage: true,
		});
		throw error;
	}
}
async function api(path, method = "GET", args, client = page) {
	const response = await client.request.fetch(path, {
		method,
		headers: { Origin: base },
		...(args === undefined ? {} : { data: args }),
	});
	const data = await response.json();
	return { status: response.status(), data };
}
async function go(view, space, extra = {}) {
	await page.goto(
		"/?" + new URLSearchParams({ view, month: "2026-11", space, ...extra }),
	);
	await page.locator("#app-content [data-view-content]").waitFor();
}
async function submit(form, path) {
	const [response] = await Promise.all([
		page.waitForResponse(
			(r) =>
				new URL(r.url()).pathname === path && r.request().method() !== "GET",
		),
		form.locator("button[type=submit]").click(),
	]);
	assert.equal(response.status(), 200, await response.text());
	await page
		.locator("[data-global-message]")
		.filter({ hasText: /Saved|updated/i })
		.waitFor()
		.catch(() => {});
}
async function register(p, email, name) {
	await p.goto("/?auth=register");
	await p.getByLabel("Name", { exact: true }).fill(name);
	await p.getByLabel("Email", { exact: true }).fill(email);
	await p
		.locator('form[data-auth="register"] [name=password]')
		.fill("browser-password-1234");
	await p.getByRole("button", { name: "Create account", exact: true }).click();
	const setup = p.locator('form[data-op="budgets:setup"]');
	await setup.waitFor();
	await setup.locator("[name=name]").fill(name);
	await setup.locator("[name=timeZone]").fill("UTC");
	await setup.locator("button[type=submit]").click();
	await p.locator("[data-view-content]").waitFor();
}
let space,
	groceries,
	housing,
	account,
	user,
	entry,
	category,
	bob,
	bobContext,
	shared;
try {
	await step("Registration, setup, and single login form", async () => {
		await page.goto("/");
		assert.equal(await page.locator("form[data-auth=login]").count(), 1);
		await register(page, "alice@browser.test", "Alice Browser");
		const home = (await api("/api/me/budgets")).data;
		space = home.spaces[0]._id;
		user = { ...home.user, _id: home.user.id };
		const categories = (await api("/api/categories?spaceId=" + space)).data;
		groceries = categories.find((c) => c.name === "Groceries")._id;
		housing = categories.find((c) => c.name === "Housing")._id;
		account = await app.runtime.exclusive(async () =>
			app.store.insert("accounts", {
				userId: user.id,
				spaceId: space,
				name: "Simulated checking",
				type: "checking",
				mask: "1234",
				active: true,
				revision: 0,
			}),
		);
		await app.runtime.invoke(
			"budgets:saveTransaction",
			{
				spaceId: space,
				accountId: account,
				description: "Fixture income",
				amount: -300000,
				date: "2026-11-01",
				kind: "income",
				pending: false,
				note: "Simulated data",
				splits: [],
				revision: 0,
			},
			user,
		);
	});
	await step("Category creation and rename", async () => {
		await go("transactions", space, { categoryEdit: "new" });
		let form = page.locator('form[data-op="budgets:saveCategory"]');
		await form.locator("[name=name]").fill("Browser category");
		await submit(form, "/api/categories");
		category = (await api("/api/categories?spaceId=" + space)).data.find(
			(c) => c.name === "Browser category",
		)._id;
		await go("transactions", space, { categoryEdit: category });
		form = page.locator('form[data-op="budgets:saveCategory"]');
		await form.locator("[name=name]").fill("Renamed browser category");
		await submit(form, "/api/categories");
	});
	await step("Transaction creation with two splits", async () => {
		await go("transactions", space, { edit: "new" });
		const form = page.locator('form[data-op="budgets:saveTransaction"]');
		await form.locator("[name=description]").fill("Browser purchase");
		await form.locator("[name=amount]").fill("25.00");
		await form.locator("[name=date]").fill("2026-11-10");
		await form.locator("[name=kind]").selectOption("purchase");
		await form
			.locator("[data-rows] select[name=categoryId]")
			.first()
			.selectOption(category);
		await form
			.locator("[data-rows] input[name=allocationAmount]")
			.first()
			.fill("10.00");
		await form.locator("[data-add-row]").click();
		await form
			.locator("[data-rows] select[name=categoryId]")
			.nth(1)
			.selectOption(groceries);
		await form
			.locator("[data-rows] input[name=allocationAmount]")
			.nth(1)
			.fill("15.00");
		await submit(form, "/api/transactions");
		entry = (
			await api(`/api/transactions?spaceId=${space}&month=2026-11`)
		).data.rows.find((t) => t.description === "Browser purchase")._id;
		assert.equal((await app.store.get(entry)).splits.length, 2);
	});
	await step(
		"Transaction edit and search/account/category filters",
		async () => {
			await go("transactions", space, { edit: entry });
			const form = page.locator('form[data-op="budgets:saveTransaction"]');
			await form.locator("[name=description]").fill("Edited browser purchase");
			await form.locator("[name=note]").fill("Changed in Playwright");
			await submit(form, "/api/transactions");
			await go("transactions", space);
			const filters = page.locator("[data-filters]");
			await filters.locator("[name=search]").fill("Edited browser");
			await filters.locator("[name=accountId]").selectOption(account);
			await filters.locator("[name=categoryId]").selectOption(category);
			await filters.locator("button[type=submit]").click();
			await page.waitForURL(/search=Edited/);
			await page
				.getByRole("link", { name: "Edited browser purchase", exact: true })
				.waitFor();
			await page
				.getByRole("link", { name: "Fixture income", exact: true })
				.waitFor({ state: "detached" });
		},
	);
	await step("Category deletion reassigns existing split", async () => {
		await go("transactions", space, { categoryEdit: category });
		const form = page.locator('form[data-op="budgets:deleteCategory"]');
		await form.locator("[name=replacementId]").selectOption(housing);
		await submit(form, "/api/categories");
		assert.ok(
			(await app.store.get(entry)).splits.some((s) => s.categoryId === housing),
		);
		assert.equal(await app.store.get(category), null);
	});
	await step("Transaction deletion", async () => {
		await go("transactions", space, { edit: entry });
		const [response] = await Promise.all([
			page.waitForResponse(
				(r) =>
					r.request().method() === "DELETE" &&
					new URL(r.url()).pathname === "/api/transactions",
			),
			page.locator('button[data-op="budgets:deleteTransaction"]').click(),
		]);
		assert.equal(response.status(), 200);
		assert.equal(await app.store.get(entry), null);
	});
	await step("Zero balance plan validation and save", async () => {
		await go("budget", space);
		const form = page.locator('form[data-op="budgets:savePlan"]');
		await form.locator("[name=expectedIncome]").fill("3000.00");
		await form.locator("[name=savingsTarget]").fill("500.00");
		assert.equal(await form.locator("button[type=submit]").isDisabled(), true);
		await form.locator(`[name="limit:${housing}"]`).fill("2500.00");
		await submit(form, "/api/monthly-plan");
		assert.equal(
			(await api(`/api/dashboard?spaceId=${space}&month=2026-11`)).data.balance,
			0,
		);
	});
	await step(
		"Completed monthly review and repeated carry-forward",
		async () => {
			await go("review", space);
			let form = page.locator('form[data-op="budgets:review"]');
			await form.locator("[data-add-row]").click();
			await form
				.locator("[data-rows] select[name=categoryId]")
				.first()
				.selectOption(groceries);
			await form
				.locator("[data-rows] input[name=allocationAmount]")
				.first()
				.fill("100.00");
			await submit(form, "/api/monthly-review");
			await go("review", space);
			form = page.locator('form[data-op="budgets:review"]');
			await form
				.locator("[data-rows] input[name=allocationAmount]")
				.first()
				.fill("150.00");
			await submit(form, "/api/monthly-review");
			const carry = await app.store
				.query("carry")
				.withIndex("by_source", (q) =>
					q.eq("spaceId", space).eq("sourceMonth", "2026-11"),
				)
				.collect();
			assert.equal(
				carry.reduce((s, c) => s + c.amount, 0),
				15000,
			);
			const december = (
				await api(`/api/dashboard?spaceId=${space}&month=2026-12`)
			).data;
			assert.equal(december.reserved?.length ?? 0, 0);
			assert.ok(
				december.plan.limits.some(
					(l) => l.categoryId === groceries && l.amount === 15000,
				),
			);
		},
	);
	await step(
		"Shared budget, email invitation acceptance, and two-user private rejection",
		async () => {
			await go("accounts", space);
			await page.locator('button[data-op="sharing:create"]').click();
			await page.waitForFunction(
				() =>
					!document.querySelector(
						'button[data-op="sharing:create"]:not([hidden])',
					) ||
					document
						.querySelector("[data-global-message]")
						?.textContent.includes("Saved"),
			);
			shared = (await api("/api/me/budgets")).data.spaces.find(
				(s) => s.type === "shared",
			)._id;
			await go("accounts", shared);
			const form = page.locator('form[data-op="sharing:invite"]');
			await form.locator("[name=email]").fill("bob@browser.test");
			await submit(form, "/api/invitations");
			for (let i = 0; i < 3; i++) await app.runtime.drainJobs();
			const token = new URL(
				emails.at(-1).text.match(/http[^\s]+/)[0],
			).searchParams.get("invite");
			bobContext = await browser.newContext({ baseURL: base });
			bob = await bobContext.newPage();
			bob.on("dialog", (d) => d.accept());
			await register(bob, "bob@browser.test", "Bob Browser");
			await bob.goto("/?view=accounts&invite=" + token);
			await bob.locator('button[data-op="sharing:accept"]').click();
			await bob
				.locator("[data-global-message]")
				.filter({ hasText: "Saved" })
				.waitFor();
			assert.equal(
				(
					await api(
						`/api/dashboard?spaceId=${space}&month=2026-11`,
						"GET",
						undefined,
						bob,
					)
				).status,
				403,
			);
		},
	);
	await step("Shared personal allocation save", async () => {
		await go("budget", shared);
		const people = page.locator('form[data-op="personalAllocations:save"]');
		assert.equal(await people.count(), 2);
		const form = people.first();
		await form.locator("[name=amount]").fill("500.00");
		await submit(form, "/api/personal-allocations");
		const list = (
			await api(`/api/personal-allocations?sharedId=${shared}&month=2026-11`)
		).data;
		assert.ok(list.some((p) => p.amount === 50000));
	});
	await step("Shared updates and dirty form retention", async () => {
		await go("budget", shared);
		const form = page.locator('form[data-op="budgets:savePlan"]');
		await form.locator("[name=savingsTarget]").fill("123.00");
		const categories = (await api("/api/categories?spaceId=" + shared)).data;
		await app.runtime.invoke(
			"budgets:saveCategory",
			{
				spaceId: shared,
				id: categories[0]._id,
				name: "Changed by partner",
				color: categories[0].color,
				revision: categories[0].revision,
			},
			user,
		);
		await page
			.locator("[data-live-change]")
			.waitFor({ state: "visible", timeout: 15000 });
		assert.equal(
			await form.locator("[name=savingsTarget]").inputValue(),
			"123.00",
		);
		await page.locator("[data-reload]").last().click();
		await page.locator('form[data-op="budgets:savePlan"]').waitFor();
		await page.waitForFunction(
			() =>
				document.querySelector("input[name=savingsTarget]")?.value !== "123.00",
		);
		await page.getByText("Changed by partner", { exact: true }).waitFor();
	});
	await step(
		"Profile/password changes and keyboard login persistence",
		async () => {
			await go("profile", space);
			const profile = page.locator("form[data-profile]");
			await profile.locator("[name=name]").fill("Alice Updated");
			await submit(profile, "/api/me/profile");
			await page.getByText("Change password", { exact: true }).click();
			const form = page.locator("form[data-auth=changePassword]");
			await form
				.locator("[name=currentPassword]")
				.fill("browser-password-1234");
			await form.locator("[name=newPassword]").fill("browser-password-updated");
			await form.locator("button[type=submit]").click();
			await form
				.locator("[data-message]")
				.filter({ hasText: "Password updated" })
				.waitFor();
			await page.locator("[data-sign-out]").click();
			await page.locator("form[data-auth=login]").waitFor();
			await page
				.getByLabel("Email", { exact: true })
				.fill("alice@browser.test");
			await page
				.getByLabel("Password", { exact: true })
				.fill("browser-password-updated");
			await page.keyboard.press("Enter");
			await page.locator("[data-view-content]").waitFor();
			await page.reload();
			await page.locator("[data-view-content]").waitFor();
			assert.equal(
				(await api("/api/me/budgets")).data.profile.name,
				"Alice Updated",
			);
			await page.keyboard.press("Tab");
			assert.notEqual(
				await page.evaluate(() => document.activeElement?.tagName),
				"BODY",
			);
		},
	);
	await step(
		"Mobile principal views have no overflow and readable screenshots",
		async () => {
			await page.setViewportSize({ width: 375, height: 812 });
			for (const view of [
				"overview",
				"transactions",
				"budget",
				"review",
				"accounts",
				"profile",
			]) {
				await go(view, space);
				assert.ok(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= innerWidth + 1,
					),
					view + " overflow",
				);
				await page.screenshot({
					path: `output/browser/mobile-${view}.png`,
					fullPage: true,
				});
			}
			await page.setViewportSize({ width: 1440, height: 1000 });
			await go("overview", space);
			await page.screenshot({
				path: "output/browser/desktop-overview.png",
				fullPage: true,
			});
		},
	);
	assert.deepEqual(errors, []);
} finally {
	await writeFile(
		"output/browser/results.json",
		JSON.stringify(
			{
				recordedAt: new Date().toISOString(),
				base,
				fixture:
					"isolated in-memory SQLite; simulated checking account and income; mocked Resend; no real providers",
				results,
				pageErrors: errors,
			},
			null,
			2,
		) + "\n",
	);
	await context.tracing.stop({ path: "output/browser/trace.zip" });
	await bobContext?.close();
	await context.close();
	await browser.close();
	globalThis.fetch = realFetch;
	await app.close();
}
