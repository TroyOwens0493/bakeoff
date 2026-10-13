import assert from "node:assert/strict";
import test from "node:test";
import {
	type SpendingReport,
	spendingChart,
} from "../src/components/spending-chart.ts";

const categories = [
	{ _id: "food", name: "Food", color: "#123456" },
	{ _id: "rent", name: "Rent", color: "#abcdef" },
];

function close(actual: number, expected: number) {
	assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

test("total bars use category colors and share a proportional monthly scale", () => {
	const chart = spendingChart(
		[
			{
				month: "2026-09",
				spending: 10000,
				categories: { rent: 7500, food: 2500 },
			},
			{ month: "2026-10", spending: 5000, categories: { food: 5000 } },
		],
		categories,
	);
	assert.equal(chart.zero, 1);
	assert.equal(chart.rows[0].spending, 10000);
	assert.deepEqual(
		chart.rows[0].segments.map((s) => s.color),
		["#123456", "#abcdef"],
	);
	close(chart.rows[0].segments[0].height, 0.25);
	close(chart.rows[0].segments[1].height, 0.75);
	close(chart.rows[0].segments[1].top, 0);
	close(chart.rows[1].segments[0].height, 0.5);
});

test("a category view uses only its values and its current color", () => {
	const chart = spendingChart(
		[
			{
				month: "2026-09",
				spending: 10000,
				categories: { food: 2500, rent: 7500 },
			},
			{ month: "2026-10", spending: 5000, categories: { rent: 5000 } },
		],
		[{ ...categories[0], color: "#654321" }, categories[1]],
		"food",
	);
	assert.equal(chart.rows[0].spending, 2500);
	assert.equal(chart.rows[0].segments.length, 1);
	assert.equal(chart.rows[0].segments[0].color, "#654321");
	assert.equal(chart.rows[0].segments[0].height, 1);
	assert.equal(chart.rows[1].spending, 0);
	assert.deepEqual(chart.rows[1].segments, []);
});

test("refund segments retain their colors and extend below the shared zero line", () => {
	const reports: SpendingReport[] = [
		{ month: "2026-09", spending: 10000, categories: { food: 10000 } },
		{
			month: "2026-10",
			spending: -4000,
			categories: { food: 1000, rent: -5000 },
		},
	];
	const chart = spendingChart(reports, categories);
	close(chart.zero, 2 / 3);
	const [purchase, refund] = chart.rows[1].segments;
	assert.equal(chart.rows[1].spending, -4000);
	assert.equal(refund.color, categories[1].color);
	close(purchase.top + purchase.height, chart.zero);
	close(refund.top, chart.zero);
	close(refund.top + refund.height, 1);
	const refundsOnly = spendingChart(reports, categories, "rent");
	assert.equal(refundsOnly.zero, 0);
	assert.equal(refundsOnly.rows[1].segments[0].height, 1);
});

test("empty months are empty and uncategorized spending is retained", () => {
	assert.deepEqual(spendingChart([], categories), { zero: 1, rows: [] });
	const chart = spendingChart(
		[
			{ month: "2026-09", spending: 0, categories: {} },
			{
				month: "2026-10",
				spending: 10000,
				categories: { food: 2500, missing: 5000 },
			},
		],
		categories,
	);
	assert.deepEqual(chart.rows[0].segments, []);
	assert.equal(
		chart.rows[1].segments.reduce((sum, s) => sum + s.amount, 0),
		10000,
	);
	assert.equal(
		chart.rows[1].segments.find((s) => s.categoryId === "missing")?.name,
		"Uncategorized",
	);
	assert.equal(
		chart.rows[1].segments.find((s) => s.categoryId === "")?.amount,
		2500,
	);
});
