import assert from "node:assert/strict";
import test from "node:test";
import {
	assertRevision,
	cents,
	leftovers,
	nextMonth,
	planBalance,
	recurring,
	totals,
	validateSplits,
} from "../src/domain/budget.ts";

test("money is exact to the cent, with strict input validation", () => {
	assert.equal(cents("1234.56"), 123456);
	assert.equal(cents("-0.01"), -1);
	assert.throws(() => cents("1.001"));
	assert.throws(() => cents("1e3"));
	assert.throws(() => cents("900719925474099.00"));
});
test("activation accounts for contributions, savings and carry-forward", () => {
	const p = {
		expectedIncome: 300000,
		savingsTarget: 50000,
		limits: [{ categoryId: "food", amount: 100000 }],
	};
	assert.equal(planBalance(p, 0, 160000, 10000), 0);
	assert.equal(planBalance(p, 0, 160001, 10000), -1);
	assert.throws(() => planBalance({ ...p, savingsTarget: -1 }));
	assert.throws(() =>
		planBalance({ ...p, limits: [...p.limits, ...p.limits] }),
	);
});
test("transfers, pending entries and reconciled entries do not inflate final totals; refunds reduce spending", () => {
	const entries = [
		{ amount: -400000, kind: "income" as const, pending: false, splits: [] },
		{
			amount: 60000,
			kind: "purchase" as const,
			pending: false,
			splits: [{ categoryId: "food", amount: 60000 }],
		},
		{
			amount: -10000,
			kind: "purchase" as const,
			pending: false,
			splits: [{ categoryId: "food", amount: -10000 }],
		},
		{ amount: 40000, kind: "transfer" as const, pending: false, splits: [] },
		{ amount: 10000, kind: "purchase" as const, pending: true, splits: [] },
		{
			amount: 60000,
			kind: "purchase" as const,
			pending: false,
			splits: [],
			removed: true,
		},
	];
	assert.deepEqual(totals(entries, 20000, 30000), {
		income: 400000,
		spending: 50000,
		pending: 10000,
		categories: { food: 50000 },
		incoming: 20000,
		outgoing: 30000,
		savings: 340000,
	});
});
test("shared contributions cancel when budgets are combined", () => {
	const personal = totals(
		[
			{ amount: -100000, kind: "income", pending: false, splits: [] },
			{ amount: 30000, kind: "transfer", pending: false, splits: [] },
		],
		0,
		30000,
	);
	const shared = totals(
		[{ amount: -30000, kind: "transfer", pending: false, splits: [] }],
		30000,
		0,
	);
	assert.equal(personal.savings + shared.savings, 100000);
	assert.equal(personal.income + shared.income, 100000);
});
test("splits must retain total and sign, including refunds", () => {
	validateSplits(100, [
		{ categoryId: "a", amount: 40 },
		{ categoryId: "b", amount: 60 },
	]);
	validateSplits(-100, [{ categoryId: "a", amount: -100 }]);
	assert.throws(() => validateSplits(100, [{ categoryId: "a", amount: 99 }]));
	assert.throws(() =>
		validateSplits(100, [
			{ categoryId: "a", amount: 150 },
			{ categoryId: "b", amount: -50 },
		]),
	);
});
test("review reservations cannot manufacture leftovers; corrections can invalidate them", () => {
	assert.equal(leftovers(95000, 80000, 10000), 5000);
	assert.equal(leftovers(-5000, 80000), 0);
	assert.equal(leftovers(85000, 80000, 10000), -5000);
});
test("month changes and concurrent edits are checked", () => {
	assert.equal(nextMonth("2026-12"), "2027-01");
	assert.throws(() => nextMonth("2026-13"));
	assertRevision(5, 5);
	assert.throws(() => assertRevision(6, 5));
});
test("recurring suggestions need three regular posted monthly charges", () => {
	const entries = ["2026-01-10", "2026-02-10", "2026-03-10"].map((date) => ({
		date,
		description: "Streaming",
		amount: 1299,
		pending: false,
		kind: "purchase",
	}));
	assert.equal(recurring(entries)[0].date, "2026-04-10");
	assert.equal(recurring(entries.slice(0, 2)).length, 0);
	assert.equal(
		recurring([...entries.slice(0, 2), { ...entries[2], pending: true }])
			.length,
		0,
	);
});
