import {
	type FunctionArgs,
	type FunctionReference,
	type FunctionReturnType,
	getFunctionName,
} from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { initialSpace, reportingMonth, reportStart } from "./bootstrap";
import type { PageData } from "./page-data";

export type QueryReader = <Q extends FunctionReference<"query">>(
	query: Q,
	args: FunctionArgs<Q>,
) => Promise<FunctionReturnType<Q>>;

// The browser owns the authenticated client. This module only chooses queries.
export async function loadBudget(
	url: URL,
	queryReader: QueryReader,
	convexUrl: string,
): Promise<PageData> {
	const p = url.searchParams;
	const views = [
		"overview",
		"transactions",
		"budget",
		"review",
		"accounts",
		"profile",
	];
	const page: PageData = {
		convexUrl,
		home: null,
		month: "",
		view: views.includes(p.get("view") ?? "")
			? p.get("view")!
			: p.has("invite")
				? "accounts"
				: "overview",
		watches: [],
	};
	async function read<Q extends FunctionReference<"query">>(
		query: Q,
		args: FunctionArgs<Q>,
	) {
		const value = await queryReader(query, args);
		page.watches.push({
			name: getFunctionName(query),
			args,
			value: JSON.stringify(value),
		});
		return value;
	}
	const home = await read(api.budgets.home, {});
	page.home = home;
	if (!home.profile) return page;
	const space =
		home.spaces.find((s) => s._id === p.get("space")) ?? initialSpace(home);
	if (!space) throw new Error("No budget is available.");
	page.space = space;
	page.month = /^\d{4}-(0[1-9]|1[0-2])$/.test(p.get("month") ?? "")
		? p.get("month")!
		: reportingMonth(space.timeZone);
	const { month } = page;
	const spaceId = space._id;
	[page.dashboard, page.alerts] = await Promise.all([
		read(api.budgets.dashboard, { spaceId, month }),
		read(api.budgets.alerts, { spaceId, month }),
	]);
	if (page.view === "overview")
		[page.reports, page.recurring] = await Promise.all([
			read(api.budgets.reports, {
				spaceId,
				from: reportStart(month),
				to: month,
			}),
			read(api.budgets.recurring, { spaceId }),
		]);
	if (page.view === "budget" && space.type === "shared")
		page.people = await read(api.personalAllocations.list, {
			sharedId: spaceId,
			month,
		});
	if (page.view === "transactions" || page.view === "accounts")
		page.accounts = await read(api.accounts.list, { spaceId });
	if (page.view === "transactions") {
		page.transactions = await read(api.budgets.transactions, {
			spaceId,
			month,
			search: p.get("search") ?? "",
			...(p.get("categoryId")
				? { categoryId: p.get("categoryId") as Id<"categories"> }
				: {}),
			...(p.get("accountId")
				? { accountId: p.get("accountId") as Id<"accounts"> }
				: {}),
			...(p.get("cursor") ? { cursor: p.get("cursor")! } : {}),
		});
		if (p.has("edit")) {
			// Editors can only select records from the authorized monthly dashboard.
			page.entry =
				page.dashboard.entries.find(
					(x) => x._id === p.get("edit") && !x.removed,
				) ?? null;
			if (p.get("edit") !== "new" && !page.entry)
				throw new Error("Transaction not found.");
			if (page.entry?.source === "manual")
				page.imports = await read(api.budgets.transactions, {
					spaceId,
					month: page.entry.date.slice(0, 7),
					accountId: page.entry.accountId,
					limit: 100,
				});
		}
	}
	if (page.view === "accounts") {
		[page.connections, page.sharing] = await Promise.all([
			read(api.accounts.connections, {}),
			read(api.sharing.status, { spaceId }),
		]);
		const shared = home.spaces.find((s) => s.type === "shared" && s.active);
		if (space.type === "private" && shared) {
			page.contributionSharedId = shared._id;
			page.contributions = await read(api.contributions.list, {
				privateId: spaceId,
				sharedId: shared._id,
				month,
			});
		}
		if (p.get("bankReview"))
			page.bankReview = await read(api.bank.review, {
				id: p.get("bankReview") as Id<"connections">,
			});
	}
	return page;
}
