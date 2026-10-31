import assert from "node:assert/strict";
import test from "node:test";
import { formArgs } from "../src/lib/form-args";

const form = (entries: [string, string][]) => {
	const data = new FormData();
	for (const [key, value] of entries) data.append(key, value);
	return data;
};

test("Astro plan forms send integer cents and preserve the editor revision", () => {
	assert.deepEqual(
		formArgs(
			form([
				["expectedIncome", "1200.25"],
				["savingsTarget", "200.25"],
				["limit:groceries", "1000.00"],
			]),
			{ spaceId: "private", month: "2026-10", revision: 7 },
			"plan",
		),
		{
			spaceId: "private",
			month: "2026-10",
			revision: 7,
			expectedIncome: 120025,
			savingsTarget: 20025,
			limits: [{ categoryId: "groceries", amount: 100000 }],
		},
	);
});
test("review forms retain category and savings destinations without duplicate fields", () => {
	assert.deepEqual(
		formArgs(
			form([
				["categoryId", ""],
				["allocationAmount", "25.00"],
				["categoryId", "food"],
				["allocationAmount", "30.40"],
			]),
			{ revision: 2 },
			"review",
		),
		{
			revision: 2,
			allocations: [{ amount: 2500 }, { categoryId: "food", amount: 3040 }],
		},
	);
});
test("transactions preserve refund signs, splits and bank-controlled pending status", () => {
	const data = form([
		["amount", "-10.01"],
		["kind", "purchase"],
		["categoryId", "food"],
		["allocationAmount", "-10.01"],
		["pending", "on"],
	]);
	assert.deepEqual(
		formArgs(data, { revision: 3, pending: false }, "transaction"),
		{
			revision: 3,
			pending: false,
			amount: -1001,
			kind: "purchase",
			splits: [{ categoryId: "food", amount: -1001 }],
		},
	);
	data.set("kind", "transfer");
	assert.deepEqual(formArgs(data, { revision: 3 }, "transaction").splits, []);
	assert.equal(formArgs(data, {}, "transaction").pending, true);
});
test("duplicate bank decisions and personal allocations use exact API types", () => {
	assert.deepEqual(
		formArgs(
			form([
				["decision:one", "same"],
				["decision:two", "different"],
			]),
			{ id: "bank" },
			"bankReview",
		),
		{
			id: "bank",
			decisions: [
				{ accountId: "one", sameAccount: true },
				{ accountId: "two", sameAccount: false },
			],
		},
	);
	assert.deepEqual(
		formArgs(form([["amount", "15.99"]]), { revision: 2 }, "", "amount"),
		{ revision: 2, amount: 1599 },
	);
	assert.throws(() => formArgs(form([["amount", "1.999"]]), {}, "", "amount"));
});
