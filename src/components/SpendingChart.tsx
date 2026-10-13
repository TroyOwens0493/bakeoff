import {
	type SpendingCategory,
	type SpendingReport,
	spendingChart,
} from "./spending-chart";
import { usd } from "./ui";

export function SpendingChart({
	reports,
	categories,
	categoryId,
}: {
	reports: SpendingReport[];
	categories: SpendingCategory[];
	categoryId: string;
}) {
	const chart = spendingChart(reports, categories, categoryId);
	const name = categories.find((c) => c._id === categoryId)?.name;
	return (
		<div
			className="bar-chart"
			role="img"
			aria-label={`Monthly ${name ? `${name} spending` : "spending by category"}. Refunds extend below zero. Exact values are in the table below.`}
		>
			{chart.rows.map((row) => (
				<div key={row.month} aria-hidden="true">
					<div className="spending-bar">
						<span
							className="spending-zero"
							style={{ top: `${chart.zero * 100}%` }}
						/>
						{row.segments.map((segment) => (
							<span
								key={segment.categoryId}
								className="spending-segment"
								style={{
									top: `${segment.top * 100}%`,
									height: `${segment.height * 100}%`,
									backgroundColor: segment.color,
								}}
								title={`${row.month} · ${segment.name}: ${usd(segment.amount)}`}
							/>
						))}
					</div>
					<small>{row.month.slice(5)}</small>
				</div>
			))}
		</div>
	);
}
