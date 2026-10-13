export type SpendingReport = {
	month: string;
	spending: number;
	categories: Record<string, number>;
};

export type SpendingCategory = { _id: string; name: string; color: string };

const fallbackColor = "#8a938c";

/** Place category amounts above or below one shared zero line. */
export function spendingChart(
	reports: SpendingReport[],
	categories: SpendingCategory[],
	categoryId = "",
) {
	const known = new Map(categories.map((category) => [category._id, category]));
	const rows = reports.map((report) => {
		const amounts = categoryId
			? [[categoryId, report.categories[categoryId] ?? 0] as const]
			: Object.entries(report.categories).sort(
					([a], [b]) =>
						categories.findIndex((c) => c._id === a) -
						categories.findIndex((c) => c._id === b),
				);
		const spending = categoryId
			? (report.categories[categoryId] ?? 0)
			: report.spending;
		const remainder =
			spending - amounts.reduce((sum, [, amount]) => sum + amount, 0);
		if (remainder) amounts.push(["", remainder]);
		const segments = amounts
			.filter(([, amount]) => amount !== 0)
			.map(([id, amount]) => ({
				categoryId: id,
				name: known.get(id)?.name ?? "Uncategorized",
				color: known.get(id)?.color ?? fallbackColor,
				amount,
			}));
		return {
			month: report.month,
			spending,
			segments,
			positive: segments.reduce((sum, s) => sum + Math.max(0, s.amount), 0),
			negative: segments.reduce((sum, s) => sum + Math.max(0, -s.amount), 0),
		};
	});
	const positive = Math.max(0, ...rows.map((row) => row.positive));
	const negative = Math.max(0, ...rows.map((row) => row.negative));
	const range = Math.max(1, positive + negative);
	const zero = negative ? positive / range : 1;
	return {
		zero,
		rows: rows.map((row) => {
			let above = zero;
			let below = zero;
			return {
				month: row.month,
				spending: row.spending,
				segments: row.segments.map((segment) => {
					const height = Math.abs(segment.amount) / range;
					const top = segment.amount > 0 ? above - height : below;
					if (segment.amount > 0) above = top;
					else below += height;
					return { ...segment, top, height };
				}),
			};
		}),
	};
}
