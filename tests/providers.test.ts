import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hash, verifyWebhook } from "../server/features/plaidClient.ts";
import { Runtime } from "../server/runtime.ts";
import { Store } from "../server/store.ts";

test("bank link, encrypted token exchange, durable import jobs, idempotent sync, failure retention, reconnect and disconnect", async () => {
	const directory = await mkdtemp(join(tmpdir(), "budget-provider-"));
	const path = join(directory, "bank.sqlite");
	let store = new Store(path);
	let runtime = new Runtime(store);
	const original = globalThis.fetch;
	const previous = { ...process.env };
	process.env.PLAID_CLIENT_ID = "fixture";
	process.env.PLAID_SECRET = "fixture";
	process.env.PLAID_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
	process.env.SITE_URL = "http://localhost:3003";
	let fail = false;
	const calls: { path: string; body: any }[] = [];
	const account = {
		account_id: "bank-a",
		persistent_account_id: "persistent-a",
		name: "Checking",
		type: "depository",
		subtype: "checking",
		mask: "1234",
	};
	globalThis.fetch = async (input, options) => {
		const url = new URL(String(input));
		assert.equal(url.hostname, "sandbox.plaid.com");
		const body = JSON.parse(String(options?.body));
		calls.push({ path: url.pathname, body });
		switch (url.pathname) {
			case "/link/token/create":
				return Response.json({ link_token: "link-test" });
			case "/item/public_token/exchange":
				return Response.json({
					access_token: "provider-access-secret",
					item_id: "item-a",
				});
			case "/accounts/get":
				return Response.json({ accounts: [account] });
			case "/item/get":
				return Response.json({ item: { institution_id: "institution-a" } });
			case "/institutions/get_by_id":
				return Response.json({ institution: { name: "Test Bank" } });
			case "/transactions/sync":
				return fail
					? Response.json(
							{ error_code: "ITEM_LOGIN_REQUIRED" },
							{ status: 400 },
						)
					: Response.json({
							added: [
								{
									transaction_id: "tx-a",
									account_id: "bank-a",
									name: "Groceries",
									amount: 25.12,
									date: "2026-11-10",
									pending: false,
								},
							],
							modified: [],
							removed: [],
							accounts: [account],
							next_cursor: "cursor-a",
							has_more: false,
						});
			case "/item/remove":
				return Response.json({ removed: true });
			default:
				throw new Error(`Unexpected provider path: ${url.pathname}`);
		}
	};
	const user = {
		_id: "users:fixture",
		id: "users:fixture",
		email: "fixture@example.test",
		name: "Fixture",
	};
	try {
		await runtime.invoke(
			"budgets:setup",
			{ name: "Fixture", timeZone: "UTC" },
			user,
		);
		assert.equal(await runtime.invoke("bank:link", {}, user), "link-test");
		assert.equal(calls[0].body.webhook, "http://localhost:3003/bank-events");
		const id = await runtime.invoke(
			"bank:exchange",
			{ publicToken: "public-test" },
			user,
		);
		const connection = await store.get(id);
		assert.notEqual(connection?.accessToken, "provider-access-secret");
		assert.equal(store.sql.prepare("SELECT count(*) n FROM jobs").get()?.n, 1);
		store.close();
		store = new Store(path);
		runtime = new Runtime(store);
		await runtime.drainJobs();
		const home = await runtime.invoke("budgets:home", {}, user);
		const spaceId = home.spaces[0]._id;
		let page = await runtime.invoke(
			"budgets:transactions",
			{ spaceId, month: "2026-11" },
			user,
		);
		assert.equal(page.rows.length, 1);
		assert.equal(page.rows[0].amount, 2512);
		await runtime.invoke("bank:sync", { id }, user);
		assert.equal(
			(
				await runtime.invoke(
					"budgets:transactions",
					{ spaceId, month: "2026-11" },
					user,
				)
			).rows.length,
			1,
		);
		fail = true;
		await assert.rejects(
			() => runtime.invoke("bank:sync", { id }, user),
			/sync failed/i,
		);
		assert.equal((await store.get(id))?.status, "reconnect");
		assert.equal(
			(
				await runtime.invoke(
					"budgets:transactions",
					{ spaceId, month: "2026-11" },
					user,
				)
			).rows.length,
			1,
		);
		assert.equal(
			await runtime.invoke("bank:link", { connectionId: id }, user),
			"link-test",
		);
		assert.equal(calls.at(-1)?.body.access_token, "provider-access-secret");
		fail = false;
		await runtime.invoke("bank:sync", { id }, user);
		await runtime.invoke("bank:disconnect", { id }, user);
		assert.equal((await store.get(id))?.status, "disconnected");
		assert.equal((await store.get(id))?.accessToken, "");
		page = await runtime.invoke(
			"budgets:transactions",
			{ spaceId, month: "2026-11" },
			user,
		);
		assert.equal(page.rows.length, 1);
	} finally {
		globalThis.fetch = original;
		process.env = previous;
		store.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test("webhook signatures require ES256, a recent timestamp, and the exact body hash", async () => {
	const original = globalThis.fetch;
	const previous = { ...process.env };
	process.env.PLAID_CLIENT_ID = "fixture";
	process.env.PLAID_SECRET = "fixture";
	const key = await crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	);
	const publicKey = await crypto.subtle.exportKey("jwk", key.publicKey);
	globalThis.fetch = async () => Response.json({ key: publicKey });
	const encode = (value: unknown) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	const body = JSON.stringify({
		item_id: "item-a",
		webhook_type: "TRANSACTIONS",
	});
	const make = async (iat: number) => {
		const first = encode({ alg: "ES256", kid: "fixture" });
		const second = encode({ iat, request_body_sha256: await hash(body) });
		const signature = await crypto.subtle.sign(
			{ name: "ECDSA", hash: "SHA-256" },
			key.privateKey,
			new TextEncoder().encode(`${first}.${second}`),
		);
		return `${first}.${second}.${Buffer.from(signature).toString("base64url")}`;
	};
	try {
		const token = await make(Date.now() / 1000);
		await verifyWebhook(token, body);
		await assert.rejects(() => verifyWebhook(token, `${body} `), /signature/);
		await assert.rejects(() => verifyWebhook("invalid", body), /signature/);
		const expired = await make(Date.now() / 1000 - 600);
		await assert.rejects(() => verifyWebhook(expired, body), /signature/);
	} finally {
		globalThis.fetch = original;
		process.env = previous;
	}
});
