import { ConvexError, v } from "convex/values";
import {
	assertRevision,
	recurring as detectRecurring,
	isPlanSaved,
	leftovers,
	money,
	month,
	nextMonth,
	planBalance,
	totals,
	validateSplits,
} from "../src/domain/budget";
import type { Doc, Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { access, label, readCutoff, user } from "./access";
import { kind, split } from "./schema";

export const setup = mutation({
	args: { name: v.string(), timeZone: v.string() },
	handler: async (ctx, args) => {
		const current = await user(ctx);
		try {
			new Intl.DateTimeFormat("en", { timeZone: args.timeZone });
		} catch {
			throw new ConvexError("Choose a valid time zone.");
		}
		const existing = await ctx.db
			.query("profiles")
			.withIndex("by_user", (q) => q.eq("userId", current._id))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, {
				name: label(args.name),
				timeZone: args.timeZone,
			});
			return;
		}
		await ctx.db.insert("profiles", {
			userId: current._id,
			name: label(args.name),
			email: current.email.toLowerCase(),
			timeZone: args.timeZone,
		});
		const spaceId = await ctx.db.insert("spaces", {
			name: "My budget",
			type: "private",
			ownerId: current._id,
			timeZone: args.timeZone,
		});
		await ctx.db.insert("memberships", {
			spaceId,
			userId: current._id,
			active: true,
			joinedAt: Date.now(),
		});
		for (const [order, name] of [
			"Housing",
			"Groceries",
			"Dining out",
			"Entertainment",
			"Transport",
			"Other",
		].entries())
			await ctx.db.insert("categories", {
				spaceId,
				name,
				color: [
					"#9daf87",
					"#90ac75",
					"#d5ac65",
					"#ada9cf",
					"#d89774",
					"#83aaa2",
				][order],
				order,
				revision: 0,
			});
	},
});
export const home = query({
	args: {},
	handler: async (ctx) => {
		const current = await user(ctx);
		const profile = await ctx.db
			.query("profiles")
			.withIndex("by_user", (q) => q.eq("userId", current._id))
			.unique();
		const memberships = await ctx.db
			.query("memberships")
			.withIndex("by_user", (q) => q.eq("userId", current._id))
			.collect();
		const spaces = await Promise.all(
			memberships.map(async (m) => {
				const space = (await ctx.db.get(m.spaceId))!;
				return {
					...space,
					name: space.type === "shared" ? "Shared" : space.name,
					active: m.active,
				};
			}),
		);
		return {
			profile,
			spaces,
			user: { name: current.name, email: current.email, id: current._id },
		};
	},
});
export const categories = query({
	args: { spaceId: v.id("spaces") },
	handler: async (ctx, args) => {
		await access(ctx, args.spaceId);
		const cutoff = await readCutoff(ctx, args.spaceId);
		return ctx.db
			.query("categories")
			.withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
			.filter((q) =>
				q.lte(
					q.field("_creationTime"),
					Number.isFinite(cutoff) ? cutoff : Number.MAX_SAFE_INTEGER,
				),
			)
			.collect();
	},
});
export const saveCategory = mutation({
	args: {
		spaceId: v.id("spaces"),
		id: v.optional(v.id("categories")),
		name: v.string(),
		color: v.string(),
		revision: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await access(ctx, args.spaceId, true);
		const name = label(args.name);
		if (!/^#[\da-f]{6}$/i.test(args.color))
			throw new ConvexError("Choose a valid color.");
		const all = await ctx.db
			.query("categories")
			.withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
			.collect();
		if (
			all.some(
				(x) => x._id !== args.id && x.name.toLowerCase() === name.toLowerCase(),
			)
		)
			throw new ConvexError("A category with this name already exists.");
		if (args.id) {
			const existing = await ctx.db.get(args.id);
			if (!existing || existing.spaceId !== args.spaceId)
				throw new ConvexError("Category not found.");
			assertRevision(existing.revision, args.revision ?? -1);
			await ctx.db.patch(args.id, {
				name,
				color: args.color,
				revision: existing.revision + 1,
			});
			return args.id;
		}
		return ctx.db.insert("categories", {
			spaceId: args.spaceId,
			name,
			color: args.color,
			order: all.length,
			revision: 0,
		});
	},
});
export const deleteCategory = mutation({
	args: {
		id: v.id("categories"),
		replacementId: v.id("categories"),
		revision: v.number(),
	},
	handler: async (ctx, args) => {
		const category = await ctx.db.get(args.id);
		const replacement = await ctx.db.get(args.replacementId);
		if (
			!category ||
			!replacement ||
			category.spaceId !== replacement.spaceId ||
			args.id === args.replacementId
		)
			throw new ConvexError("Choose a different category in this budget.");
		await access(ctx, category.spaceId, true);
		assertRevision(category.revision, args.revision);
		const transactions = await ctx.db
			.query("transactions")
			.withIndex("by_space_date", (q) => q.eq("spaceId", category.spaceId))
			.collect();
		for (const entry of transactions)
			if (entry.splits.some((x) => x.categoryId === args.id))
				await ctx.db.patch(entry._id, {
					splits: entry.splits.map((x) => ({
						...x,
						categoryId:
							x.categoryId === args.id ? args.replacementId : x.categoryId,
					})),
					revision: entry.revision + 1,
				});
		const plans = await ctx.db
			.query("plans")
			.withIndex("by_month", (q) => q.eq("spaceId", category.spaceId))
			.collect();
		for (const plan of plans) {
			const amounts = new Map<Id<"categories">, number>();
			for (const x of plan.limits) {
				const id = x.categoryId === args.id ? args.replacementId : x.categoryId;
				amounts.set(id, (amounts.get(id) ?? 0) + x.amount);
			}
			await ctx.db.patch(plan._id, {
				limits: [...amounts].map(([categoryId, amount]) => ({
					categoryId,
					amount,
				})),
				revision: plan.revision + 1,
			});
		}
		const carries = await ctx.db
			.query("carry")
			.withIndex("by_source", (q) => q.eq("spaceId", category.spaceId))
			.collect();
		for (const carry of carries)
			if (carry.categoryId === args.id)
				await ctx.db.patch(carry._id, { categoryId: args.replacementId });
		await ctx.db.delete(args.id);
	},
});
async function funding(
	ctx: QueryCtx | MutationCtx,
	spaceId: Id<"spaces">,
	m: string,
) {
	const cutoff = await readCutoff(ctx, spaceId);
	const outgoing = await ctx.db
		.query("contributions")
		.withIndex("by_private", (q) => q.eq("privateId", spaceId).eq("month", m))
		.filter((q) =>
			q.lte(
				q.field("_creationTime"),
				Number.isFinite(cutoff) ? cutoff : Number.MAX_SAFE_INTEGER,
			),
		)
		.collect();
	const incoming = await ctx.db
		.query("contributions")
		.withIndex("by_shared", (q) => q.eq("sharedId", spaceId).eq("month", m))
		.filter((q) =>
			q.lte(
				q.field("_creationTime"),
				Number.isFinite(cutoff) ? cutoff : Number.MAX_SAFE_INTEGER,
			),
		)
		.collect();
	const carry = await ctx.db
		.query("carry")
		.withIndex("by_destination", (q) =>
			q.eq("spaceId", spaceId).eq("destinationMonth", m),
		)
		.filter((q) =>
			q.lte(
				q.field("_creationTime"),
				Number.isFinite(cutoff) ? cutoff : Number.MAX_SAFE_INTEGER,
			),
		)
		.collect();
	async function actual(rows: Doc<"contributions">[]) {
		let value = 0;
		for (const contribution of rows)
			for (const pair of contribution.pairs) {
				const out = await ctx.db.get(pair.outId);
				const incoming = await ctx.db.get(pair.inId);
				if (
					out &&
					incoming &&
					!out.removed &&
					!incoming.removed &&
					!out.pending &&
					!incoming.pending &&
					out.kind === "transfer" &&
					incoming.kind === "transfer" &&
					out.amount === pair.amount &&
					incoming.amount === -pair.amount &&
					out.date.slice(0, 7) === m &&
					incoming.date.slice(0, 7) === m &&
					out._creationTime <= cutoff &&
					incoming._creationTime <= cutoff
				)
					value += pair.amount;
			}
		return value;
	}
	return {
		outgoing: outgoing.reduce((s, x) => s + x.planned, 0),
		incoming: incoming.reduce((s, x) => s + x.planned, 0),
		actualOutgoing: await actual(outgoing),
		actualIncoming: await actual(incoming),
		carry: carry.reduce((s, x) => s + x.amount, 0),
		allocations: carry,
	};
}
export async function results(
	ctx: QueryCtx | MutationCtx,
	spaceId: Id<"spaces">,
	m: string,
) {
	const cutoff = await readCutoff(ctx, spaceId);
	const entries = await ctx.db
		.query("transactions")
		.withIndex("by_space_date", (q) =>
			q
				.eq("spaceId", spaceId)
				.gte("date", `${m}-01`)
				.lt("date", `${nextMonth(m)}-01`),
		)
		.filter((q) =>
			q.lte(
				q.field("_creationTime"),
				Number.isFinite(cutoff) ? cutoff : Number.MAX_SAFE_INTEGER,
			),
		)
		.collect();
	const funds = await funding(ctx, spaceId, m);
	return {
		...totals(entries, funds.actualIncoming, funds.actualOutgoing),
		funds,
		entries,
	};
}
export const dashboard = query({
	args: { spaceId: v.id("spaces"), month: v.string() },
	handler: async (ctx, args) => {
		const cutoff = await readCutoff(ctx, args.spaceId);
		month(args.month);
		const result = await results(ctx, args.spaceId, args.month);
		const plan = await ctx.db
			.query("plans")
			.withIndex("by_month", (q) =>
				q.eq("spaceId", args.spaceId).eq("month", args.month),
			)
			.filter((q) =>
				q.lte(
					q.field("_creationTime"),
					Number.isFinite(cutoff) ? cutoff : Number.MAX_SAFE_INTEGER,
				),
			)
			.unique();
		const categories = await ctx.db
			.query("categories")
			.withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
			.filter((q) =>
				q.lte(
					q.field("_creationTime"),
					Number.isFinite(cutoff) ? cutoff : Number.MAX_SAFE_INTEGER,
				),
			)
			.collect();
		const reserved = await ctx.db
			.query("carry")
			.withIndex("by_source", (q) =>
				q.eq("spaceId", args.spaceId).eq("sourceMonth", args.month),
			)
			.filter((q) =>
				q.lte(
					q.field("_creationTime"),
					Number.isFinite(cutoff) ? cutoff : Number.MAX_SAFE_INTEGER,
				),
			)
			.collect();
		return {
			...result,
			plan: plan ? { ...plan, saved: isPlanSaved(plan) } : null,
			categories: categories.sort((a, b) => a.order - b.order),
			reserved,
			available: leftovers(
				result.savings,
				plan?.savingsTarget ?? 0,
				reserved.reduce((s, x) => s + x.amount, 0),
			),
			balance: plan
				? planBalance(
						plan,
						result.funds.incoming,
						result.funds.outgoing,
						result.funds.carry,
					)
				: null,
		};
	},
});
export const savePlan = mutation({
	args: {
		spaceId: v.id("spaces"),
		month: v.string(),
		expectedIncome: v.number(),
		savingsTarget: v.number(),
		limits: v.array(split),
		revision: v.number(),
	},
	handler: async (ctx, args) => {
		await access(ctx, args.spaceId, true);
		month(args.month);
		const old = await ctx.db
			.query("plans")
			.withIndex("by_month", (q) =>
				q.eq("spaceId", args.spaceId).eq("month", args.month),
			)
			.unique();
		assertRevision(old?.revision ?? 0, args.revision);
		for (const limit of args.limits) {
			const category = await ctx.db.get(limit.categoryId);
			if (category?.spaceId !== args.spaceId)
				throw new ConvexError("Every category must belong to this budget.");
		}
		const funds = await funding(ctx, args.spaceId, args.month);
		for (const source of new Set(funds.allocations.map((x) => x.sourceMonth))) {
			const sourceResult = await results(ctx, args.spaceId, source);
			const sourcePlan = await ctx.db
				.query("plans")
				.withIndex("by_month", (q) =>
					q.eq("spaceId", args.spaceId).eq("month", source),
				)
				.unique();
			const allocated = await ctx.db
				.query("carry")
				.withIndex("by_source", (q) =>
					q.eq("spaceId", args.spaceId).eq("sourceMonth", source),
				)
				.collect();
			if (
				allocated.reduce((sum, x) => sum + x.amount, 0) >
				Math.max(0, sourceResult.savings - (sourcePlan?.savingsTarget ?? 0))
			)
				throw new ConvexError(
					`Carry-forward from ${source} is invalid. Reopen its review.`,
				);
		}
		const balance = planBalance(
			args,
			funds.incoming,
			funds.outgoing,
			funds.carry,
		);
		if (balance !== 0)
			throw new ConvexError(
				`The plan must balance. ${balance} cents remain to allocate.`,
			);
		const value = {
			spaceId: args.spaceId,
			month: args.month,
			expectedIncome: args.expectedIncome,
			savingsTarget: args.savingsTarget,
			limits: args.limits,
			saved: true,
			reviewed: false,
			revision: (old?.revision ?? 0) + 1,
		};
		if (old) await ctx.db.patch(old._id, { ...value, status: undefined });
		else await ctx.db.insert("plans", value);
	},
});
export const repeatPlan = mutation({
	args: { spaceId: v.id("spaces"), month: v.string() },
	handler: async (ctx, args) => {
		await access(ctx, args.spaceId, true);
		month(args.month);
		const destination = nextMonth(args.month);
		const old = await ctx.db
			.query("plans")
			.withIndex("by_month", (q) =>
				q.eq("spaceId", args.spaceId).eq("month", args.month),
			)
			.unique();
		if (!old) throw new ConvexError("Save this month first.");
		const existing = await ctx.db
			.query("plans")
			.withIndex("by_month", (q) =>
				q.eq("spaceId", args.spaceId).eq("month", destination),
			)
			.unique();
		if (existing) throw new ConvexError("The next month already has a plan.");
		await ctx.db.insert("plans", {
			spaceId: args.spaceId,
			month: destination,
			expectedIncome: old.expectedIncome,
			savingsTarget: old.savingsTarget,
			limits: old.limits,
			saved: false,
			reviewed: false,
			revision: 1,
		});
	},
});
export const transactions = query({
	args: {
		spaceId: v.id("spaces"),
		month: v.string(),
		search: v.optional(v.string()),
		categoryId: v.optional(v.id("categories")),
		accountId: v.optional(v.id("accounts")),
		cursor: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const cutoff = await readCutoff(ctx, args.spaceId);
		month(args.month);
		const rows = await ctx.db
			.query("transactions")
			.withIndex("by_space_date", (q) =>
				q
					.eq("spaceId", args.spaceId)
					.gte("date", `${args.month}-01`)
					.lt("date", `${nextMonth(args.month)}-01`),
			)
			.order("desc")
			.collect();
		const matches = rows.filter(
			(x) =>
				x._creationTime <= cutoff &&
				!x.removed &&
				(!args.search ||
					`${x.description} ${x.note}`
						.toLowerCase()
						.includes(args.search.toLowerCase())) &&
				(!args.categoryId ||
					x.splits.some((s) => s.categoryId === args.categoryId)) &&
				(!args.accountId || x.accountId === args.accountId),
		);
		const offset = args.cursor
			? matches.findIndex((x) => x._id === args.cursor) + 1
			: 0;
		const size = Math.max(1, Math.min(100, args.limit ?? 30));
		const page = matches.slice(offset, offset + size);
		return {
			rows: page,
			next: offset + size < matches.length ? page.at(-1)?._id : null,
			total: matches.length,
		};
	},
});
export const saveTransaction = mutation({
	args: {
		spaceId: v.id("spaces"),
		id: v.optional(v.id("transactions")),
		accountId: v.id("accounts"),
		description: v.string(),
		amount: v.number(),
		date: v.string(),
		kind,
		pending: v.boolean(),
		note: v.string(),
		splits: v.array(split),
		revision: v.number(),
	},
	handler: async (ctx, args) => {
		await access(ctx, args.spaceId, true);
		const account = await ctx.db.get(args.accountId);
		const old = args.id ? await ctx.db.get(args.id) : null;
		if (
			!account ||
			(!old && (!account.active || account.spaceId !== args.spaceId)) ||
			(old &&
				(old.spaceId !== args.spaceId || old.accountId !== args.accountId))
		)
			throw new ConvexError("Choose an account in this budget.");
		if (args.id && !old) throw new ConvexError("Transaction not found.");
		assertRevision(old?.revision ?? 0, args.revision);
		money(args.amount);
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(args.date) ||
			!Number.isFinite(Date.parse(args.date)) ||
			new Date(`${args.date}T12:00:00Z`).toISOString().slice(0, 10) !==
				args.date
		)
			throw new ConvexError("Enter a valid date.");
		if (args.kind === "purchase") {
			validateSplits(args.amount, args.splits);
			for (const s of args.splits)
				if ((await ctx.db.get(s.categoryId))?.spaceId !== args.spaceId)
					throw new ConvexError("Choose categories from this budget.");
		} else if (args.splits.length)
			throw new ConvexError("Only purchases and refunds use category splits.");
		// Contributions use transfers, with exclusion governed by a separate confirmed pair.

		if (args.note.length > 2000)
			throw new ConvexError("Notes can contain at most 2000 characters.");
		if (
			old?.source === "plaid" &&
			(old.amount !== args.amount ||
				old.date !== args.date ||
				old.pending !== args.pending)
		)
			throw new ConvexError(
				"Imported amount, date, and pending status are set by the bank.",
			);
		const linked = await linkedContribution(ctx, old?._id);
		if (
			linked &&
			(args.kind !== "transfer" ||
				old?.amount !== args.amount ||
				old?.date !== args.date ||
				old?.pending !== args.pending)
		)
			throw new ConvexError(
				"Remove the contribution match before changing its classification.",
			);
		const value = {
			spaceId: args.spaceId,
			accountId: args.accountId,
			description: label(args.description, 200),
			amount: args.amount,
			date: args.date,
			kind: args.kind,
			pending: args.pending,
			note: args.note,
			splits: args.splits,
			revision: (old?.revision ?? 0) + 1,
			edited: true,
		};
		if (old) await ctx.db.patch(old._id, value);
		else
			await ctx.db.insert("transactions", {
				...value,
				source: "manual",
				removed: false,
			});
	},
});
async function linkedContribution(
	ctx: QueryCtx | MutationCtx,
	id: Id<"transactions"> | undefined,
) {
	if (!id) return null;
	const entry = await ctx.db.get(id);
	if (!entry) return null;
	const m = entry.date.slice(0, 7);
	const rows = [
		...(await ctx.db
			.query("contributions")
			.withIndex("by_private", (q) =>
				q.eq("privateId", entry.spaceId).eq("month", m),
			)
			.collect()),
		...(await ctx.db
			.query("contributions")
			.withIndex("by_shared", (q) =>
				q.eq("sharedId", entry.spaceId).eq("month", m),
			)
			.collect()),
	];
	return rows.find((x) => x.pairs.some((p) => p.outId === id || p.inId === id));
}
export const deleteTransaction = mutation({
	args: { id: v.id("transactions"), revision: v.number() },
	handler: async (ctx, args) => {
		const entry = await ctx.db.get(args.id);
		if (!entry) throw new ConvexError("Transaction not found.");
		await access(ctx, entry.spaceId, true);
		assertRevision(entry.revision, args.revision);
		if (entry.source !== "manual")
			throw new ConvexError("Only manual entries can be deleted.");
		if (await linkedContribution(ctx, args.id))
			throw new ConvexError("Remove the contribution match first.");
		await ctx.db.delete(args.id);
	},
});
export const reconcile = mutation({
	args: {
		manualId: v.id("transactions"),
		importId: v.id("transactions"),
		revision: v.number(),
	},
	handler: async (ctx, args) => {
		const manual = await ctx.db.get(args.manualId);
		const imported = await ctx.db.get(args.importId);
		if (
			!manual ||
			!imported ||
			manual.source !== "manual" ||
			imported.source !== "plaid" ||
			manual.spaceId !== imported.spaceId ||
			manual.accountId !== imported.accountId ||
			manual.amount !== imported.amount ||
			manual.removed ||
			imported.removed
		)
			throw new ConvexError(
				"Choose an imported entry in the same account with the same amount.",
			);
		await access(ctx, manual.spaceId, true);
		assertRevision(manual.revision, args.revision);
		if (
			(await linkedContribution(ctx, manual._id)) ||
			(await linkedContribution(ctx, imported._id))
		)
			throw new ConvexError("Remove contribution matches first.");
		await ctx.db.patch(imported._id, {
			kind: manual.kind,
			note: manual.note,
			splits: manual.splits,
			edited: true,
			revision: imported.revision + 1,
		});
		await ctx.db.patch(manual._id, {
			removed: true,
			reconciledWith: imported._id,
			revision: manual.revision + 1,
		});
	},
});
export const review = mutation({
	args: {
		spaceId: v.id("spaces"),
		month: v.string(),
		allocations: v.array(
			v.object({
				categoryId: v.optional(v.id("categories")),
				amount: v.number(),
			}),
		),
		revision: v.number(),
	},
	handler: async (ctx, args) => {
		await access(ctx, args.spaceId, true);
		month(args.month);
		const plan = await ctx.db
			.query("plans")
			.withIndex("by_month", (q) =>
				q.eq("spaceId", args.spaceId).eq("month", args.month),
			)
			.unique();
		if (!plan || !isPlanSaved(plan))
			throw new ConvexError(
				"Save this month’s budget before completing its review.",
			);
		assertRevision(plan.revision, args.revision);
		const result = await results(ctx, args.spaceId, args.month);
		const amount = args.allocations.reduce(
			(s, x) => s + money(x.amount, true),
			0,
		);
		if (amount > Math.max(0, result.savings - plan.savingsTarget))
			throw new ConvexError(
				"Carry-forward exceeds this month’s savings above target.",
			);
		for (const x of args.allocations)
			if (
				x.categoryId &&
				(await ctx.db.get(x.categoryId))?.spaceId !== args.spaceId
			)
				throw new ConvexError("Choose categories from this budget.");
		const destinationMonth = nextMonth(args.month);
		const destination = await ctx.db
			.query("plans")
			.withIndex("by_month", (q) =>
				q.eq("spaceId", args.spaceId).eq("month", destinationMonth),
			)
			.unique();
		const previous = await ctx.db
			.query("carry")
			.withIndex("by_source", (q) =>
				q.eq("spaceId", args.spaceId).eq("sourceMonth", args.month),
			)
			.collect();
		const base = destination ?? {
			expectedIncome: plan.expectedIncome,
			savingsTarget: plan.savingsTarget,
			limits: plan.limits,
			revision: 0,
		};
		let savingsTarget = base.savingsTarget;
		const limits = new Map<Id<"categories">, number>(
			base.limits.map((x) => [x.categoryId, x.amount]),
		);
		for (const x of previous) {
			if (x.categoryId)
				limits.set(x.categoryId, (limits.get(x.categoryId) ?? 0) - x.amount);
			else savingsTarget -= x.amount;
		}
		for (const x of args.allocations) {
			if (x.categoryId)
				limits.set(x.categoryId, (limits.get(x.categoryId) ?? 0) + x.amount);
			else savingsTarget += x.amount;
		}
		if (savingsTarget < 0 || [...limits.values()].some((x) => x < 0))
			throw new ConvexError(
				"The next month’s limits were changed. Increase them before removing its reserved funding.",
			);
		const next = {
			spaceId: args.spaceId,
			month: destinationMonth,
			expectedIncome: base.expectedIncome,
			savingsTarget,
			limits: [...limits].map(([categoryId, amount]) => ({
				categoryId,
				amount,
			})),
			saved: isPlanSaved(destination),
			reviewed: false,
			revision: base.revision + 1,
		};
		if (destination)
			await ctx.db.patch(destination._id, { ...next, status: undefined });
		else await ctx.db.insert("plans", next);
		for (const old of previous) await ctx.db.delete(old._id);
		for (const x of args.allocations)
			if (x.amount > 0)
				await ctx.db.insert("carry", {
					spaceId: args.spaceId,
					sourceMonth: args.month,
					destinationMonth,
					...x,
				});
		await ctx.db.patch(plan._id, {
			reviewed: true,
			revision: plan.revision + 1,
		});
	},
});
export const reports = query({
	args: { spaceId: v.id("spaces"), from: v.string(), to: v.string() },
	handler: async (ctx, args) => {
		await access(ctx, args.spaceId);
		month(args.from);
		month(args.to);
		const rows = [];
		for (let m = args.from; m <= args.to; m = nextMonth(m)) {
			if (rows.length >= 24) throw new ConvexError("Select at most 24 months.");
			const result = await results(ctx, args.spaceId, m);
			rows.push({
				month: m,
				income: result.income,
				spending: result.spending,
				savings: result.savings,
				categories: result.categories,
			});
		}
		return rows;
	},
});
export const recurring = query({
	args: { spaceId: v.id("spaces") },
	handler: async (ctx, args) => {
		const cutoff = await readCutoff(ctx, args.spaceId);
		const entries = await ctx.db
			.query("transactions")
			.withIndex("by_space_date", (q) => q.eq("spaceId", args.spaceId))
			.collect();
		const states = await ctx.db
			.query("recurring")
			.withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
			.collect();
		return detectRecurring(
			entries.filter((x) => x._creationTime <= cutoff),
		).map((x) => ({
			...x,
			status:
				states.find((s) => s.merchant === x.merchant)?.status ?? "suggested",
		}));
	},
});
export const setRecurring = mutation({
	args: {
		spaceId: v.id("spaces"),
		merchant: v.string(),
		status: v.union(v.literal("confirmed"), v.literal("dismissed")),
	},
	handler: async (ctx, args) => {
		await access(ctx, args.spaceId, true);
		const rows = await ctx.db
			.query("recurring")
			.withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
			.collect();
		const old = rows.find((x) => x.merchant === args.merchant);
		if (old) await ctx.db.patch(old._id, { status: args.status });
		else await ctx.db.insert("recurring", args);
	},
});
export const alerts = query({
	args: { spaceId: v.id("spaces"), month: v.string() },
	handler: async (ctx, args) => {
		const { current } = await access(ctx, args.spaceId);
		const cutoff = await readCutoff(ctx, args.spaceId);
		month(args.month);
		const result = await results(ctx, args.spaceId, args.month);
		const plan = await ctx.db
			.query("plans")
			.withIndex("by_month", (q) =>
				q.eq("spaceId", args.spaceId).eq("month", args.month),
			)
			.filter((q) =>
				q.lte(
					q.field("_creationTime"),
					Number.isFinite(cutoff) ? cutoff : Number.MAX_SAFE_INTEGER,
				),
			)
			.unique();
		const reads = await ctx.db
			.query("alertReads")
			.withIndex("by_user", (q) => q.eq("userId", current._id))
			.collect();
		const items = [];
		for (const x of plan?.limits ?? []) {
			const spent = result.categories[x.categoryId] ?? 0;
			if (spent > x.amount || (x.amount > 0 && spent >= x.amount * 0.8)) {
				const severity = spent > x.amount ? "over" : "near";
				const key = `${args.spaceId}:${args.month}:${x.categoryId}:${severity}`;
				const category = await ctx.db.get(x.categoryId);
				items.push({
					key,
					text: `${category?.name ?? "Category"}: ${severity === "over" ? "over budget" : "80% or more used"}`,
					read: reads.some((x) => x.key === key),
				});
			}
		}
		const reserved = await ctx.db
			.query("carry")
			.withIndex("by_source", (q) =>
				q.eq("spaceId", args.spaceId).eq("sourceMonth", args.month),
			)
			.collect();
		if (
			leftovers(
				result.savings,
				plan?.savingsTarget ?? 0,
				reserved.reduce((s, x) => s + x.amount, 0),
			) < 0
		)
			items.push({
				key: `${args.spaceId}:${args.month}:carry`,
				text: "Corrected transactions made carry-forward invalid. Reopen the monthly review.",
				read: false,
			});
		return items;
	},
});
export const readAlert = mutation({
	args: { spaceId: v.id("spaces"), key: v.string() },
	handler: async (ctx, args) => {
		const { current } = await access(ctx, args.spaceId);
		if (!args.key.startsWith(`${args.spaceId}:`))
			throw new ConvexError("Invalid alert.");
		const rows = await ctx.db
			.query("alertReads")
			.withIndex("by_user", (q) => q.eq("userId", current._id))
			.collect();
		if (!rows.some((x) => x.key === args.key))
			await ctx.db.insert("alertReads", { userId: current._id, key: args.key });
	},
});
export type Transaction = Doc<"transactions">;

export const ensureMonth = mutation({
	args: { spaceId: v.id("spaces"), month: v.string() },
	handler: async (ctx, args) => {
		await access(ctx, args.spaceId, true);
		month(args.month);
		const existing = await ctx.db
			.query("plans")
			.withIndex("by_month", (q) =>
				q.eq("spaceId", args.spaceId).eq("month", args.month),
			)
			.unique();
		if (existing) return;
		const previous = await ctx.db
			.query("plans")
			.withIndex("by_month", (q) =>
				q.eq("spaceId", args.spaceId).lt("month", args.month),
			)
			.order("desc")
			.first();
		if (!previous) return;
		await ctx.db.insert("plans", {
			spaceId: args.spaceId,
			month: args.month,
			expectedIncome: previous.expectedIncome,
			savingsTarget: previous.savingsTarget,
			limits: previous.limits,
			saved: false,
			reviewed: false,
			revision: 1,
		});
	},
});
