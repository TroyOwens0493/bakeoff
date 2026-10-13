import { nextMonth, totals } from "../../src/domain/budget";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { readCutoff } from "../access";

export async function funding(
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
