import assert from "node:assert/strict";
import test from "node:test";
import { type FunctionReturnType, getFunctionName } from "convex/server";
import type { api } from "../convex/_generated/api";
import { loadBudget, type QueryReader } from "../src/lib/load-budget";

type Home = FunctionReturnType<typeof api.budgets.home>;
const space = {
	_id: "private",
	name: "My budget",
	type: "private",
	active: true,
	timeZone: "America/Boise",
};
test("browser loader scopes subscriptions to the chosen budget and month", async () => {
	const calls: { name: string; args: Record<string, unknown> }[] = [];
	const read: QueryReader = async (query, args) => {
		const name = getFunctionName(query);
		calls.push({ name, args });
		if (name === "budgets:home")
			return {
				profile: { name: "Alice" },
				user: { name: "Alice" },
				spaces: [space],
			} as never;
		if (name === "budgets:dashboard")
			return { entries: [], categories: [] } as never;
		return [] as never;
	};
	const page = await loadBudget(
		new URL("https://app.example/?view=transactions&month=2026-02&search=food"),
		read,
		"https://test.convex.cloud",
	);
	assert.equal(page.month, "2026-02");
	assert.equal(page.view, "transactions");
	assert.deepEqual(calls.find((x) => x.name === "budgets:transactions")?.args, {
		spaceId: "private",
		month: "2026-02",
		search: "food",
	});
	assert.equal(page.watches.length, calls.length);
});
test("a new account loads only home data until setup is complete", async () => {
	const calls: string[] = [];
	const read: QueryReader = async (query) => {
		calls.push(getFunctionName(query));
		return { profile: null, spaces: [], user: { name: "New" } } as never;
	};
	const page = await loadBudget(
		new URL("https://app.example/"),
		read,
		"https://test.convex.cloud",
	);
	assert.equal(page.home?.profile, null);
	assert.deepEqual(calls, ["budgets:home"]);
});
test("an invalid budget selector cannot request data outside the authorized home list", async () => {
	const read: QueryReader = async (query, args) => {
		if (getFunctionName(query) === "budgets:home")
			return {
				profile: { name: "Alice" },
				user: { name: "Alice" },
				spaces: [space],
			} as unknown as FunctionReturnType<typeof query>;
		assert.equal(args.spaceId, "private");
		return [] as never;
	};
	const page = await loadBudget(
		new URL(
			"https://app.example/?space=someone-else&view=budget&month=2026-02",
		),
		read,
		"https://test.convex.cloud",
	);
	assert.equal(page.space?._id, "private");
});
test("request-local results do not retain a previous user's home", async () => {
	const run = (name: string) =>
		loadBudget(
			new URL("https://app.example/"),
			async () =>
				({
					profile: null,
					spaces: [],
					user: { name },
				}) as unknown as Home as never,
			"https://test.convex.cloud",
		);
	const [a, b] = await Promise.all([run("Alice"), run("Bob")]);
	assert.equal(a.home?.user.name, "Alice");
	assert.equal(b.home?.user.name, "Bob");
});
