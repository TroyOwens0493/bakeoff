import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import type { Home } from "./bootstrap";

export type Dashboard = FunctionReturnType<typeof api.budgets.dashboard>;
export type Watch = {
	name: string;
	args: Record<string, unknown>;
	value: string;
};
export type PageData = {
	convexUrl: string;
	home: Home | null;
	space?: Home["spaces"][number];
	month: string;
	view: string;
	watches: Watch[];
	dashboard?: Dashboard;
	alerts?: FunctionReturnType<typeof api.budgets.alerts>;
	reports?: FunctionReturnType<typeof api.budgets.reports>;
	recurring?: FunctionReturnType<typeof api.budgets.recurring>;
	accounts?: FunctionReturnType<typeof api.accounts.list>;
	connections?: FunctionReturnType<typeof api.accounts.connections>;
	sharing?: FunctionReturnType<typeof api.sharing.status>;
	people?: FunctionReturnType<typeof api.personalAllocations.list>;
	contributions?: FunctionReturnType<typeof api.contributions.list>;
	contributionSharedId?: string;
	transactions?: FunctionReturnType<typeof api.budgets.transactions>;
	entry?: Doc<"transactions"> | null;
	imports?: FunctionReturnType<typeof api.budgets.transactions>;
	bankReview?: FunctionReturnType<typeof api.bank.review>;
};

export const usd = (value: number) =>
	new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
		value / 100,
	);
export const amount = (value: number) => (value / 100).toFixed(2);
export function pageLink(url: URL, updates: Record<string, string | null>) {
	const next = new URL(url);
	for (const [key, value] of Object.entries(updates)) {
		if (value === null) next.searchParams.delete(key);
		else next.searchParams.set(key, value);
	}
	return `${next.pathname}${next.search}`;
}
