import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type Home = FunctionReturnType<typeof api.budgets.home>;
export function initialSpace(home: Home) {
	return (
		home.spaces.find((s) => s.active && s.type === "shared") ??
		home.spaces.find((s) => s.active) ??
		home.spaces[0]
	);
}

export function reportingMonth(timeZone: string, now = new Date()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
	}).formatToParts(now);
	return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

export function reportStart(month: string) {
	const date = new Date(`${month}-01T12:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() - 5);
	return date.toISOString().slice(0, 7);
}
