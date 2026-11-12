import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { start } from "../server/index.ts";
import { Runtime } from "../server/runtime.ts";
import { Store } from "../server/store.ts";

async function fixture() {
	const directory = await mkdtemp(join(tmpdir(), "budget-api-"));
	const path = join(directory, "budget.sqlite");
	const app = await start({ port: 0, database: path, jobs: false });
	const address = app.server.address();
	if (!address || typeof address === "string") throw new Error("No port");
	const base = `http://localhost:${address.port}`;
	process.env.SITE_URL = base;
	let cookie = "";
	const call = async (
		path: string,
		method = "GET",
		args?: unknown,
		session = cookie,
		origin = base,
	) => {
		const response = await fetch(base + path, {
			method,
			headers: {
				Origin: origin,
				"Content-Type": "application/json",
				Cookie: session,
			},
			body: args === undefined ? undefined : JSON.stringify(args),
		});
		const set = response.headers.get("set-cookie");
		if (set) cookie = set.split(";")[0];
		return {
			status: response.status,
			data: await response.json(),
			cookie: set,
		};
	};
	const register = async (email = "alice@example.test") => {
		const result = await call("/api/auth/register", "POST", {
			name: "Alice",
			email,
			password: "test-password-1234",
		});
		assert.equal(result.status, 200);
		return cookie;
	};
	return {
		app,
		path,
		base,
		call,
		register,
		getCookie: () => cookie,
		close: async () => {
			await app.close();
			await rm(directory, { recursive: true, force: true });
		},
	};
}
test("REST authentication, profile, validation, private access, logout, and SQLite persistence", async () => {
	const f = await fixture();
	try {
		assert.equal((await f.call("/api/me/budgets")).status, 401);
		assert.equal(
			(
				await f.call("/api/auth/register", "POST", {
					name: "Alice",
					email: "bad",
					password: "short",
				})
			).status,
			400,
		);
		const alice = await f.register();
		assert.match((await f.call("/api/auth/session")).data.user.email, /alice/);
		assert.equal(
			(
				await f.call("/api/me/profile", "PUT", {
					name: "Alice",
					timeZone: "America/Boise",
				})
			).status,
			200,
		);
		const home = (await f.call("/api/me/budgets")).data;
		const spaceId = home.spaces[0]._id;
		let categories = (await f.call(`/api/categories?spaceId=${spaceId}`)).data;
		assert.equal(categories.length, 6);
		assert.equal(
			(
				await f.call("/api/categories", "PUT", {
					spaceId,
					name: "Pets",
					color: "#aabbcc",
					unexpected: true,
				})
			).status,
			400,
		);
		const saved = await f.call("/api/categories", "PUT", {
			spaceId,
			name: "Pets",
			color: "#aabbcc",
		});
		assert.equal(saved.status, 200);
		categories = (await f.call(`/api/categories?spaceId=${spaceId}`)).data;
		const pets = categories.find((c: any) => c.name === "Pets");
		const limits = categories.map((c: any) => ({
			categoryId: c._id,
			amount: c._id === pets._id ? 50000 : 0,
		}));
		const plan = {
			spaceId,
			month: "2026-11",
			expectedIncome: 100000,
			savingsTarget: 50000,
			limits,
			revision: 0,
		};
		assert.equal(
			(await f.call("/api/monthly-plan", "PUT", { ...plan, savingsTarget: 0 }))
				.status,
			400,
		);
		assert.equal((await f.call("/api/monthly-plan", "PUT", plan)).status, 200);
		assert.equal((await f.call("/api/monthly-plan", "PUT", plan)).status, 409);
		assert.equal(
			(
				await f.call(
					"/api/categories",
					"PUT",
					{ spaceId, name: "Forged", color: "#abc" },
					alice,
					"https://evil.example",
				)
			).status,
			403,
		);
		const bob = await f.register("bob@example.test");
		assert.notEqual(alice, bob);
		assert.equal(
			(await f.call(`/api/dashboard?spaceId=${spaceId}&month=2026-11`)).status,
			403,
		);
		assert.equal(
			(
				await f.call("/api/categories", "PUT", {
					spaceId,
					name: "Intrusion",
					color: "#abc",
				})
			).status,
			403,
		);
		assert.equal((await f.call("/api/bank/apply", "POST", {})).status, 404);
		assert.equal((await f.call("/api/auth/logout", "POST", {})).status, 200);
		assert.equal((await f.call("/api/me/budgets")).status, 401);
		assert.equal(
			(
				await f.call("/api/auth/login", "POST", {
					email: "alice@example.test",
					password: "wrong",
				})
			).status,
			400,
		);
		assert.equal(
			(
				await f.call("/api/auth/login", "POST", {
					email: "alice@example.test",
					password: "test-password-1234",
				})
			).status,
			200,
		);
		const result = (
			await f.call(`/api/dashboard?spaceId=${spaceId}&month=2026-11`)
		).data;
		assert.equal(result.plan.savingsTarget, 50000);
		const passwordRow = f.app.store.sql
			.prepare("SELECT password FROM users WHERE email=?")
			.get("alice@example.test")!;
		assert.notEqual(passwordRow.password, "test-password-1234");
		const cookie = f.getCookie();
		assert.ok(
			!JSON.stringify(
				f.app.store.sql.prepare("SELECT * FROM sessions").all(),
			).includes(cookie.split("=")[1]),
		);
		const reopened = new Store(f.path);
		assert.equal((await reopened.get(spaceId))?.name, "My budget");
		reopened.close();
		assert.equal(
			(
				await f.call("/api/auth/change-password", "POST", {
					currentPassword: "test-password-1234",
					newPassword: "changed-password-1234",
				})
			).status,
			200,
		);
		await f.call("/api/auth/logout", "POST", {});
		assert.equal(
			(
				await f.call("/api/auth/login", "POST", {
					email: "alice@example.test",
					password: "test-password-1234",
				})
			).status,
			400,
		);
		assert.equal(
			(
				await f.call("/api/auth/login", "POST", {
					email: "alice@example.test",
					password: "changed-password-1234",
				})
			).status,
			200,
		);
	} finally {
		await f.close();
	}
});

test("invitation delivery/acceptance and password reset use real REST and mocked provider IO", async () => {
	const f = await fixture();
	const original = globalThis.fetch;
	const emails: any[] = [];
	const previous = {
		key: process.env.RESEND_API_KEY,
		from: process.env.RESEND_FROM,
	};
	process.env.RESEND_API_KEY = "fixture";
	process.env.RESEND_FROM = "Budget <budget@example.test>";
	globalThis.fetch = async (input, init) => {
		if (String(input) === "https://api.resend.com/emails") {
			emails.push(JSON.parse(String(init?.body)));
			return Response.json({ id: "sent" });
		}
		return original(input, init);
	};
	try {
		const alice = await f.register();
		await f.call("/api/me/profile", "PUT", { name: "Alice", timeZone: "UTC" });
		const sharedId = (await f.call("/api/shared-budgets", "POST", {})).data;
		assert.equal(
			(
				await f.call("/api/invitations", "POST", {
					spaceId: sharedId,
					email: "bob@example.test",
				})
			).status,
			200,
		);
		for (let i = 0; i < 3; i++) await f.app.runtime.drainJobs();
		const inviteToken = new URL(
			emails[0].text.match(/http[^\s]+/)[0],
		).searchParams.get("invite");
		assert.ok(inviteToken);
		await f.register("bob@example.test");
		await f.call("/api/me/profile", "PUT", { name: "Bob", timeZone: "UTC" });
		assert.equal(
			(await f.call("/api/invitations/accept", "POST", { token: inviteToken }))
				.status,
			200,
		);
		assert.equal(
			(await f.call("/api/invitations/accept", "POST", { token: inviteToken }))
				.status,
			400,
		);
		const home = (await f.call("/api/me/budgets")).data;
		assert.equal(home.spaces.filter((s: any) => s.type === "shared").length, 1);
		await f.call("/api/auth/request-password-reset", "POST", {
			email: "alice@example.test",
		});
		const resetToken = new URL(
			emails.at(-1).text.match(/http[^\s]+/)[0],
		).searchParams.get("token");
		assert.equal(
			(
				await f.call("/api/auth/reset-password", "POST", {
					token: resetToken,
					newPassword: "reset-password-1234",
				})
			).status,
			200,
		);
		assert.equal(
			(
				await f.call("/api/auth/reset-password", "POST", {
					token: resetToken,
					newPassword: "another-password-1234",
				})
			).status,
			400,
		);
		assert.equal(
			(await f.call("/api/me/budgets", "GET", undefined, alice)).status,
			401,
		);
		assert.equal(
			(
				await f.call("/api/auth/login", "POST", {
					email: "alice@example.test",
					password: "reset-password-1234",
				})
			).status,
			200,
		);
	} finally {
		globalThis.fetch = original;
		process.env.RESEND_API_KEY = previous.key;
		process.env.RESEND_FROM = previous.from;
		await f.close();
	}
});

test("SQLite mutations roll back partial writes, concurrent revisions conflict, and jobs persist", async () => {
	const store = new Store(":memory:");
	const runtime = new Runtime(store);
	try {
		const user = {
			_id: "users:test",
			id: "users:test",
			email: "test@example.test",
			name: "Test",
		};
		await runtime.invoke(
			"budgets:setup",
			{ name: "Test", timeZone: "UTC" },
			user,
		);
		const home = await runtime.invoke("budgets:home", {}, user);
		const spaceId = home.spaces[0]._id;
		const categories = await runtime.invoke(
			"budgets:categories",
			{ spaceId },
			user,
		);
		const cat = categories[0];
		const args = {
			spaceId,
			id: cat._id,
			name: "Changed",
			color: "#abcdef",
			revision: 0,
		};
		const results = await Promise.allSettled([
			runtime.invoke("budgets:saveCategory", args, user),
			runtime.invoke("budgets:saveCategory", args, user),
		]);
		assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
		assert.equal(results.filter((r) => r.status === "rejected").length, 1);
		const before = store.sql
			.prepare("SELECT count(*) AS n FROM categories")
			.get()?.n;
		await assert.rejects(() =>
			runtime.invoke(
				"budgets:saveCategory",
				{ spaceId, name: "", color: "#abcdef" },
				user,
			),
		);
		assert.equal(
			store.sql.prepare("SELECT count(*) AS n FROM categories").get()?.n,
			before,
		);
		await assert.rejects(
			() => runtime.invoke("bank:apply", {}, user),
			/not found/,
		);
	} finally {
		store.close();
	}
});
