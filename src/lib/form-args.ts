import type { Value } from "convex/values";
import { cents } from "../domain/budget";

export type Args = Record<string, Value>;

// One conversion boundary keeps dollar strings out of the cents-only API.
export function formArgs(
	data: FormData,
	base: Args = {},
	transform = "",
	moneyFields = "",
): Args {
	const args: Args = { ...base };
	for (const [key, value] of data) {
		if (typeof value !== "string") throw new Error("Files are not supported.");
		if (
			!key.startsWith("limit:") &&
			!key.startsWith("decision:") &&
			!["categoryId", "allocationAmount"].includes(key)
		)
			args[key] = value;
	}
	for (const key of moneyFields.split(",").filter(Boolean))
		args[key] = cents(String(data.get(key) ?? ""));
	const allocations = () =>
		data.getAll("categoryId").map((id, i) => ({
			...(id ? { categoryId: String(id) } : {}),
			amount: cents(String(data.getAll("allocationAmount")[i] ?? "")),
		}));
	if (transform === "plan") {
		args.expectedIncome = cents(String(data.get("expectedIncome")));
		args.savingsTarget = cents(String(data.get("savingsTarget")));
		args.limits = [...data]
			.filter(([key]) => key.startsWith("limit:"))
			.map(([key, value]) => ({
				categoryId: key.slice(6),
				amount: cents(String(value)),
			}));
	}
	if (transform === "review") args.allocations = allocations();
	if (transform === "transaction") {
		args.amount = cents(String(data.get("amount")));
		args.pending =
			typeof base.pending === "boolean"
				? base.pending
				: data.get("pending") === "on";
		args.splits = data.get("kind") === "purchase" ? allocations() : [];
	}
	if (transform === "bankReview")
		args.decisions = [...data]
			.filter(([key]) => key.startsWith("decision:"))
			.map(([key, value]) => ({
				accountId: key.slice(9),
				sameAccount: value === "same",
			}));
	return args;
}
