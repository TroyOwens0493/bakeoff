import { ConvexError, v } from "convex/values";
import { money } from "../src/domain/budget";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { type DbCtx, privateSpace, user } from "./access";
import {
	decrypt,
	encrypt,
	type PlaidAccount,
	PlaidError,
	type PlaidTransaction,
	plaid,
	type SyncPage,
} from "./plaidClient";
import { bankAccount as accountValidator } from "./schema";
export const identity = internalQuery({
	args: {},
	handler: async (ctx) => {
		const current = await user(ctx);
		const space = await privateSpace(ctx, current._id);
		return { userId: current._id, spaceId: space._id };
	},
});
export const connection = internalQuery({
	args: { id: v.id("connections"), userId: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.id);
		if (!connection || (args.userId && connection.userId !== args.userId))
			throw new ConvexError("Connection not found.");
		return connection;
	},
});
export const link = action({
	args: { connectionId: v.optional(v.id("connections")) },
	handler: async (ctx, args): Promise<string> => {
		const owner = await ctx.runQuery(internal.bank.identity, {});
		const body: Record<string, unknown> = {
			client_name: "Budget Together",
			country_codes: ["US"],
			language: "en",
			user: { client_user_id: owner.userId },
			account_filters: {
				depository: { account_subtypes: ["checking", "savings"] },
				credit: { account_subtypes: ["credit card"] },
			},
			webhook: `${process.env.CONVEX_SITE_URL}/bank-events`,
		};
		if (process.env.PLAID_REDIRECT_URI)
			body.redirect_uri = process.env.PLAID_REDIRECT_URI;
		if (args.connectionId) {
			const c = await ctx.runQuery(internal.bank.connection, {
				id: args.connectionId,
				userId: owner.userId,
			});
			if (c.status === "disconnected")
				throw new ConvexError("Connect this bank again to resume imports.");
			body.access_token = await decrypt(c.accessToken);
		} else {
			body.products = ["transactions"];
			body.transactions = { days_requested: 180 };
		}
		const result = await plaid<{ link_token: string }>(
			"/link/token/create",
			body,
		);
		return result.link_token;
	},
});
export const exchange = action({
	args: { publicToken: v.string() },
	handler: async (ctx, args): Promise<Id<"connections">> => {
		const owner = await ctx.runQuery(internal.bank.identity, {});
		const token = await plaid<{ access_token: string; item_id: string }>(
			"/item/public_token/exchange",
			{ public_token: args.publicToken },
		);
		try {
			const [accounts, item] = await Promise.all([
				plaid<{ accounts: PlaidAccount[] }>("/accounts/get", {
					access_token: token.access_token,
				}),
				plaid<{ item: { institution_id: string } }>("/item/get", {
					access_token: token.access_token,
				}),
			]);
			const institution = await plaid<{ institution: { name: string } }>(
				"/institutions/get_by_id",
				{ institution_id: item.item.institution_id, country_codes: ["US"] },
			);
			const id = await ctx.runMutation(internal.bank.store, {
				...owner,
				itemId: token.item_id,
				accessToken: await encrypt(token.access_token),
				institution: institution.institution.name,
				institutionId: item.item.institution_id,
				accounts: accounts.accounts.map((a) => ({
					account_id: a.account_id,
					name: a.name,
					type: a.type,
					subtype: a.subtype,
					mask: a.mask,
					...(a.persistent_account_id
						? { persistent_account_id: a.persistent_account_id }
						: {}),
				})),
			});
			await ctx.scheduler.runAfter(0, internal.bank.syncInternal, { id });
			return id;
		} catch (error) {
			await plaid("/item/remove", { access_token: token.access_token }).catch(
				() => undefined,
			);
			throw error;
		}
	},
});
export const store = internalMutation({
	args: {
		userId: v.string(),
		spaceId: v.id("spaces"),
		itemId: v.string(),
		accessToken: v.string(),
		institution: v.string(),
		institutionId: v.string(),
		accounts: v.array(accountValidator),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("connections")
			.withIndex("by_item", (q) => q.eq("itemId", args.itemId))
			.unique();
		if (existing) throw new ConvexError("This bank connection already exists.");
		const supported = args.accounts.filter((a) =>
			["checking", "savings", "credit card"].includes(a.subtype ?? ""),
		);
		if (!supported.length)
			throw new ConvexError(
				"Select a checking, savings, or credit card account.",
			);
		for (const a of supported)
			if (a.persistent_account_id) {
				const duplicate = await ctx.db
					.query("accounts")
					.withIndex("by_persistent", (q) =>
						q.eq("persistentId", a.persistent_account_id!),
					)
					.first();
				if (duplicate)
					throw new ConvexError(
						"An account is already connected. Reconnect its existing connection instead.",
					);
			}
		const needsReview = (
			await Promise.all(
				supported.map((a) =>
					possibleDuplicate(ctx, args.userId, args.institutionId, a),
				),
			)
		).some(Boolean);
		const id = await ctx.db.insert("connections", {
			userId: args.userId,
			itemId: args.itemId,
			accessToken: args.accessToken,
			institution: args.institution,
			institutionId: args.institutionId,
			status: needsReview ? "review" : "syncing",
			pendingAccounts: needsReview ? supported : undefined,
		});
		for (const a of needsReview ? [] : supported)
			await ctx.db.insert("accounts", {
				userId: args.userId,
				spaceId: args.spaceId,
				connectionId: id,
				externalId: a.account_id,
				...(a.persistent_account_id
					? { persistentId: a.persistent_account_id }
					: {}),
				name: a.name,
				type: a.subtype!,
				mask: a.mask ?? "",
				active: true,
				revision: 0,
			});
		return id;
	},
});

// Compare within the user's current partnership. Never return a partner's private account data.
async function possibleDuplicate(
	ctx: DbCtx,
	userId: string,
	institutionId: string,
	account: typeof accountValidator.type,
) {
	if (account.persistent_account_id || !account.mask || !institutionId)
		return false;
	const owners = new Set([userId]);
	const memberships = await ctx.db
		.query("memberships")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	for (const m of memberships) {
		const space = await ctx.db.get(m.spaceId);
		if (!m.active || space?.type !== "shared") continue;
		for (const partner of await ctx.db
			.query("memberships")
			.withIndex("by_space", (q) => q.eq("spaceId", m.spaceId))
			.collect())
			if (partner.active) owners.add(partner.userId);
	}
	for (const owner of owners) {
		for (const existing of await ctx.db
			.query("accounts")
			.withIndex("by_user", (q) => q.eq("userId", owner))
			.collect()) {
			if (
				!existing.connectionId ||
				existing.type !== account.subtype ||
				existing.mask !== account.mask
			)
				continue;
			const connection = await ctx.db.get(existing.connectionId);
			if (connection?.institutionId === institutionId) return true;
		}
	}
	return false;
}
export const review = query({
	args: { id: v.id("connections") },
	handler: async (ctx, { id }) => {
		const current = await user(ctx);
		const c = await ctx.db.get(id);
		if (!c || c.userId !== current._id)
			throw new ConvexError("Connection not found.");
		if (c.status !== "review") return null;
		return Promise.all(
			(c.pendingAccounts ?? []).map(async (a) => ({
				accountId: a.account_id,
				name: a.name,
				type: a.subtype,
				mask: a.mask,
				possibleDuplicate: await possibleDuplicate(
					ctx,
					current._id,
					c.institutionId,
					a,
				),
			})),
		);
	},
});
export const confirmAccounts = mutation({
	args: {
		id: v.id("connections"),
		decisions: v.array(
			v.object({ accountId: v.string(), sameAccount: v.boolean() }),
		),
	},
	handler: async (ctx, args) => {
		const current = await user(ctx);
		const c = await ctx.db.get(args.id);
		if (!c || c.userId !== current._id || c.status !== "review")
			throw new ConvexError("This connection is not awaiting review.");
		const space = await privateSpace(ctx, current._id);
		let added = 0;
		for (const a of c.pendingAccounts ?? []) {
			const duplicate = await possibleDuplicate(
				ctx,
				current._id,
				c.institutionId,
				a,
			);
			const decision = args.decisions.find((d) => d.accountId === a.account_id);
			if (duplicate && !decision)
				throw new ConvexError(
					"Identify each possible duplicate before importing. Reload the account review if needed.",
				);
			if (decision?.sameAccount) continue;
			// Persistent identifiers remain authoritative, including when another link completes during review.
			if (
				a.persistent_account_id &&
				(await ctx.db
					.query("accounts")
					.withIndex("by_persistent", (q) =>
						q.eq("persistentId", a.persistent_account_id!),
					)
					.first())
			)
				throw new ConvexError(
					"An account is already connected. Reconnect its existing connection instead.",
				);
			await ctx.db.insert("accounts", {
				userId: current._id,
				spaceId: space._id,
				connectionId: c._id,
				externalId: a.account_id,
				...(a.persistent_account_id
					? { persistentId: a.persistent_account_id }
					: {}),
				name: a.name,
				type: a.subtype ?? a.type,
				mask: a.mask ?? "",
				active: true,
				revision: 0,
			});
			added++;
		}
		await ctx.db.patch(c._id, {
			status: added ? "syncing" : "discarding",
			pendingAccounts: undefined,
		});
		await ctx.scheduler.runAfter(
			0,
			added ? internal.bank.syncInternal : internal.bank.discard,
			{ id: c._id },
		);
	},
});
export const discard = internalAction({
	args: { id: v.id("connections") },
	handler: async (ctx, args): Promise<void> => {
		const c = await ctx.runQuery(internal.bank.connection, args);
		if (c.status !== "discarding") return;
		await plaid("/item/remove", { access_token: await decrypt(c.accessToken) });
		await ctx.runMutation(internal.bank.stop, args);
	},
});
export const sync = action({
	args: { id: v.id("connections") },
	handler: async (ctx, args): Promise<void> => {
		const owner = await ctx.runQuery(internal.bank.identity, {});
		await ctx.runQuery(internal.bank.connection, {
			id: args.id,
			userId: owner.userId,
		});
		await ctx.runAction(internal.bank.syncInternal, args);
		const refreshed = await ctx.runQuery(internal.bank.connection, {
			id: args.id,
			userId: owner.userId,
		});
		if (refreshed.status === "stale" || refreshed.status === "reconnect")
			throw new ConvexError(
				"Bank sync failed. Your imported history is retained. Check the connection status.",
			);
	},
});
export const syncInternal = internalAction({
	args: { id: v.id("connections") },
	handler: async (ctx, args): Promise<void> => {
		const connection = await ctx.runQuery(internal.bank.connection, args);
		if (["disconnected", "review", "discarding"].includes(connection.status))
			return;
		try {
			const access_token = await decrypt(connection.accessToken);
			for (let attempt = 0; attempt < 3; attempt++) {
				try {
					let cursor = connection.cursor;
					let more = true;
					const changed: PlaidTransaction[] = [];
					const removed: string[] = [];
					while (more) {
						const page: SyncPage = await plaid("/transactions/sync", {
							access_token,
							...(cursor ? { cursor } : {}),
							count: 500,
						});
						changed.push(...page.added, ...page.modified);
						removed.push(...page.removed.map((x) => x.transaction_id));
						cursor = page.next_cursor;
						more = page.has_more;
					}
					await ctx.runMutation(internal.bank.apply, {
						id: args.id,
						expectedCursor: connection.cursor,
						cursor: cursor ?? "",
						changed: changed.map((x) => ({
							transaction_id: x.transaction_id,
							account_id: x.account_id,
							name: x.name,
							amount: x.amount,
							date: x.date,
							pending: x.pending,
							...(x.pending_transaction_id
								? { pending_transaction_id: x.pending_transaction_id }
								: {}),
							...(x.merchant_name ? { merchant_name: x.merchant_name } : {}),
							...(x.personal_finance_category
								? {
										personal_finance_category: {
											primary: x.personal_finance_category.primary,
											detailed: x.personal_finance_category.detailed,
										},
									}
								: {}),
						})),
						removed,
					});
					return;
				} catch (error) {
					if (
						error instanceof PlaidError &&
						error.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" &&
						attempt < 2
					)
						continue;
					throw error;
				}
			}
		} catch (error) {
			await ctx.runMutation(internal.bank.fail, {
				id: args.id,
				error: error instanceof PlaidError ? error.code : "SYNC_FAILED",
			});
		}
	},
});
const txValidator = v.object({
	transaction_id: v.string(),
	account_id: v.string(),
	pending_transaction_id: v.optional(v.union(v.string(), v.null())),
	name: v.string(),
	merchant_name: v.optional(v.union(v.string(), v.null())),
	amount: v.number(),
	date: v.string(),
	pending: v.boolean(),
	personal_finance_category: v.optional(
		v.union(v.object({ primary: v.string(), detailed: v.string() }), v.null()),
	),
});
// Provider responses contain more fields. Select only the fields this validator accepts before storing.
export const apply = internalMutation({
	args: {
		id: v.id("connections"),
		expectedCursor: v.optional(v.string()),
		cursor: v.string(),
		changed: v.array(txValidator),
		removed: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.id);
		if (
			!connection ||
			["disconnected", "review", "discarding"].includes(connection.status) ||
			connection.cursor !== args.expectedCursor
		)
			return;
		const accounts = await ctx.db
			.query("accounts")
			.withIndex("by_user", (q) => q.eq("userId", connection.userId))
			.filter((q) => q.eq(q.field("connectionId"), args.id))
			.collect();
		for (const raw of args.changed) {
			const x = raw as PlaidTransaction;
			const account = accounts.find((a) => a.externalId === x.account_id);
			if (!account) continue;
			const amount = money(Math.round(x.amount * 100));
			const old = await ctx.db
				.query("transactions")
				.withIndex("by_external", (q) =>
					q.eq("accountId", account._id).eq("externalId", x.transaction_id),
				)
				.unique();
			const pending = x.pending_transaction_id
				? await ctx.db
						.query("transactions")
						.withIndex("by_external", (q) =>
							q
								.eq("accountId", account._id)
								.eq("externalId", x.pending_transaction_id!),
						)
						.unique()
				: null;
			const prior = old ?? pending;
			const primary = x.personal_finance_category?.primary ?? "";
			const suggestedKind =
				primary.startsWith("TRANSFER") ||
				(x.personal_finance_category?.detailed ?? "").includes(
					"CREDIT_CARD_PAYMENT",
				)
					? ("transfer" as const)
					: primary === "INCOME"
						? ("income" as const)
						: ("purchase" as const);
			const kind = prior?.edited ? prior.kind : suggestedKind;
			const historicalAssignment = account.assignments
				?.filter((a) => a.startsOn <= x.date)
				.at(-1);
			const spaceId =
				prior?.spaceId ?? historicalAssignment?.spaceId ?? account.spaceId;
			const categories = await ctx.db
				.query("categories")
				.withIndex("by_space", (q) => q.eq("spaceId", spaceId))
				.collect();
			const detail = x.personal_finance_category?.detailed ?? "";
			const categoryName = detail.includes("GROCERIES")
				? "Groceries"
				: primary === "FOOD_AND_DRINK"
					? "Dining out"
					: detail.includes("RENT") || detail.includes("MORTGAGE")
						? "Housing"
						: primary === "TRANSPORTATION" || detail.includes("GAS")
							? "Transport"
							: primary === "ENTERTAINMENT"
								? "Entertainment"
								: "Other";
			const category =
				categories.find((c) => c.name === categoryName) ??
				categories.find((c) => c.name === "Other") ??
				categories[0];
			const splits =
				kind === "purchase"
					? prior?.edited &&
						prior.splits.reduce((s, p) => s + p.amount, 0) === amount
						? prior.splits
						: category
							? [{ categoryId: category._id, amount }]
							: []
					: [];
			const value = {
				accountId: account._id,
				spaceId,
				externalId: x.transaction_id,
				source: "plaid" as const,
				description: x.merchant_name ?? x.name,
				amount,
				date: x.date,
				pending: x.pending,
				kind,
				suggestedKind,
				note: prior?.note ?? "",
				splits,
				removed: false,
				revision: (prior?.revision ?? 0) + 1,
				edited: prior?.edited ?? false,
			};
			if (old) {
				await ctx.db.patch(old._id, value);
				if (pending && pending._id !== old._id)
					await ctx.db.patch(pending._id, {
						removed: true,
						revision: pending.revision + 1,
					});
			} else if (pending) await ctx.db.patch(pending._id, value);
			else await ctx.db.insert("transactions", value);
		}
		for (const externalId of args.removed)
			for (const account of accounts) {
				const row = await ctx.db
					.query("transactions")
					.withIndex("by_external", (q) =>
						q.eq("accountId", account._id).eq("externalId", externalId),
					)
					.unique();
				if (row)
					await ctx.db.patch(row._id, {
						removed: true,
						revision: row.revision + 1,
					});
			}
		await ctx.db.patch(args.id, {
			cursor: args.cursor,
			status: "connected",
			lastSync: Date.now(),
			error: undefined,
		});
	},
});
export const fail = internalMutation({
	args: { id: v.id("connections"), error: v.string() },
	handler: async (ctx, args) => {
		const c = await ctx.db.get(args.id);
		if (c && !["disconnected", "review", "discarding"].includes(c.status))
			await ctx.db.patch(args.id, {
				status: args.error === "ITEM_LOGIN_REQUIRED" ? "reconnect" : "stale",
				error: args.error,
			});
	},
});
export const disconnect = action({
	args: { id: v.id("connections") },
	handler: async (ctx, args): Promise<void> => {
		const owner = await ctx.runQuery(internal.bank.identity, {});
		const c = await ctx.runQuery(internal.bank.connection, {
			id: args.id,
			userId: owner.userId,
		});
		if (c.status !== "disconnected")
			await plaid("/item/remove", {
				access_token: await decrypt(c.accessToken),
			});
		await ctx.runMutation(internal.bank.stop, args);
	},
});
export const stop = internalMutation({
	args: { id: v.id("connections") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, {
			status: "disconnected",
			accessToken: "",
			pendingAccounts: undefined,
			error: undefined,
		});
	},
});
export const event = internalMutation({
	args: { itemId: v.string(), error: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const c = await ctx.db
			.query("connections")
			.withIndex("by_item", (q) => q.eq("itemId", args.itemId))
			.unique();
		if (!c || ["disconnected", "review", "discarding"].includes(c.status))
			return;
		if (args.error)
			await ctx.db.patch(c._id, { status: "reconnect", error: args.error });
		else
			await ctx.scheduler.runAfter(0, internal.bank.syncInternal, {
				id: c._id,
			});
	},
});
export const poll = internalMutation({
	args: {},
	handler: async (ctx) => {
		for (const c of await ctx.db.query("connections").collect())
			if (c.status === "discarding")
				await ctx.scheduler.runAfter(0, internal.bank.discard, { id: c._id });
			else if (!["disconnected", "review"].includes(c.status))
				await ctx.scheduler.runAfter(0, internal.bank.syncInternal, {
					id: c._id,
				});
	},
});
export { txValidator };
