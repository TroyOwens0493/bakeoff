import type { Doc } from "../../convex/_generated/dataModel";
import { spendingChart } from "../components/spending-chart";
import { nextMonth } from "../domain/budget";
import {
	amount,
	type Dashboard,
	type PageData,
	pageLink,
	usd,
} from "./page-data";
import {
	all,
	args,
	field,
	options,
	rows,
	select,
	show,
	template,
	text,
} from "./templates";

type Categories = Doc<"categories">[];
const op = (root: ParentNode, name: string, value: object) =>
	args(select(root, `[data-op="${name}"]`), value);
const disabled = (root: ParentNode, value: boolean) => {
	for (const item of all<HTMLFieldSetElement>(root, "fieldset"))
		item.disabled = value;
};
function context(root: ParentNode, page: PageData) {
	for (const item of all<HTMLInputElement>(root, 'input[type="hidden"]')) {
		if (item.name === "space") item.value = page.space?._id ?? "";
		if (item.name === "month") item.value = page.month;
		if (item.name === "view") item.value = page.view;
	}
}
function navigation(root: ParentNode, page: PageData, url: URL) {
	for (const link of all<HTMLAnchorElement>(root, "a[data-view]")) {
		const view = link.dataset.view ?? "overview";
		link.href = pageLink(url, {
			view,
			space: page.space?._id ?? null,
			month: page.month,
			edit: null,
			categoryEdit: null,
			bankReview: null,
			cursor: null,
		});
		if (link.classList.contains("nav-item")) {
			link.classList.toggle("selected", view === page.view);
			if (view === page.view) link.setAttribute("aria-current", "page");
			else link.removeAttribute("aria-current");
		}
	}
}
function summary(root: ParentNode, data: Dashboard) {
	for (const [key, value] of Object.entries({
		moneyIn: data.income + data.incoming,
		expected: data.plan?.expectedIncome ?? 0,
		incoming: data.funds.incoming,
		spending: data.spending,
		pending: data.pending,
		savings: data.savings,
		relative: data.savings - (data.plan?.savingsTarget ?? 0),
		target: data.plan?.savingsTarget ?? 0,
	}))
		text(root, key, usd(value));
}
function categoryOptions(categories: Categories) {
	return categories.map((c) => ({ value: c._id, label: c.name }));
}
function allocations(
	root: ParentNode,
	values: { categoryId?: string; amount: number }[],
	categories: Categories,
	destinationMonth?: string,
) {
	const source = select<HTMLTemplateElement>(
		root,
		"template[data-row-template]",
	);
	const choices = [
		...(destinationMonth
			? [{ value: "", label: `${destinationMonth} savings target` }]
			: []),
		...categories.map((c) => ({
			value: c._id,
			label: `${destinationMonth ? `${destinationMonth} ` : ""}${c.name}`,
		})),
	];
	options(
		select<HTMLSelectElement>(source.content, 'select[name="categoryId"]'),
		choices,
		choices[0]?.value,
	);
	const target = select(root, "[data-rows]");
	target.replaceChildren(
		...values.map((value) => {
			const node = source.content.firstElementChild?.cloneNode(
				true,
			) as HTMLElement;
			field(node, "categoryId", value.categoryId ?? choices[0]?.value ?? "");
			field(node, "allocationAmount", amount(value.amount));
			return node;
		}),
	);
}
function overview(root: HTMLElement, page: PageData, url: URL) {
	const data = page.dashboard!;
	summary(root, data);
	show(root, "noPlan", !data.plan);
	rows(root, "balances", data.categories, (node, c) => {
		const limit =
			data.plan?.limits.find((x) => x.categoryId === c._id)?.amount ?? 0;
		const used = data.entries
			.filter((x) => !x.removed && !x.pending && x.kind === "purchase")
			.reduce(
				(s, x) =>
					s +
					x.splits
						.filter((x) => x.categoryId === c._id)
						.reduce((s, x) => s + x.amount, 0),
				0,
			);
		text(node, "name", c.name);
		text(node, "used", `${usd(used)} of ${usd(limit)}`);
		text(node, "left", usd(limit - used));
		text(node, "remaining", used > limit ? "over budget" : "left to spend");
		select(node, ".category-icon").style.backgroundColor = `${c.color}25`;
		select(node, ".category-balance").classList.toggle("over", used > limit);
		const bar = select(node, "[data-progress]");
		bar.style.width = `${limit > 0 ? Math.max(0, Math.min(100, ((limit - used) / limit) * 100)) : 0}%`;
		bar.style.backgroundColor = c.color;
	});
	const category = url.searchParams.get("chartCategory") ?? "";
	options(
		select<HTMLSelectElement>(root, 'select[name="chartCategory"]'),
		[
			{ value: "", label: "All categories" },
			...categoryOptions(data.categories),
		],
		category,
	);
	const chart = spendingChart(page.reports ?? [], data.categories, category);
	const monthTemplate = select<HTMLTemplateElement>(
		root,
		"template[data-chart-month]",
	);
	select(root, "[data-chart]").replaceChildren(
		...chart.rows.map((row) => {
			const node = monthTemplate.content.firstElementChild?.cloneNode(
				true,
			) as HTMLElement;
			select(node, ".spending-zero").style.top = `${chart.zero * 100}%`;
			select(node, "small").textContent = row.month.slice(5);
			for (const segment of row.segments) {
				const bar = document.createElement("span");
				bar.className = "spending-segment";
				bar.style.top = `${segment.top * 100}%`;
				bar.style.height = `${segment.height * 100}%`;
				bar.style.backgroundColor = segment.color;
				bar.title = `${row.month} · ${segment.name}: ${usd(segment.amount)}`;
				select(node, ".spending-bar").append(bar);
			}
			return node;
		}),
	);
	rows(root, "reports", chart.rows, (node, row) => {
		text(node, "month", row.month);
		text(node, "amount", usd(row.spending));
	});
	const entries = data.entries
		.filter((x) => !x.removed)
		.slice(-3)
		.reverse();
	show(root, "noActivity", !entries.length);
	rows(root, "activity", entries, (node, x) => {
		text(node, "description", x.description);
		text(node, "detail", `${x.date} · ${x.pending ? "Pending" : x.kind}`);
		text(node, "amount", usd(-x.amount));
	});
	const recurring =
		page.recurring?.filter((x) => x.status !== "dismissed") ?? [];
	show(root, "recurring", Boolean(recurring.length));
	rows(root, "recurring", recurring, (node, x) => {
		text(node, "merchant", x.merchant);
		text(
			node,
			"detail",
			`${usd(x.amount)} · estimated ${x.date} · ${x.status}`,
		);
		for (const button of all<HTMLButtonElement>(node, "button[data-status]")) {
			args(button, {
				spaceId: page.space!._id,
				merchant: x.merchant,
				status: button.dataset.status,
			});
			button.disabled = !page.space!.active;
		}
	});
}
function plan(root: HTMLElement, page: PageData) {
	const data = page.dashboard!;
	const space = page.space!;
	const form = select<HTMLFormElement>(root, 'form[data-transform="plan"]');
	args(form, {
		spaceId: space._id,
		month: page.month,
		revision: data.plan?.revision ?? 0,
	});
	form.dataset.incoming = String(data.funds.incoming);
	form.dataset.carry = String(data.funds.carry);
	form.dataset.outgoing = String(data.funds.outgoing);
	show(form, "funded", Boolean(data.fundedBy));
	show(form, "ownIncome", !data.fundedBy);
	text(form, "personalIncoming", usd(data.funds.personalIncoming));
	field(
		form,
		"expectedIncome",
		amount(data.fundedBy ? 0 : (data.plan?.expectedIncome ?? 0)),
	);
	field(form, "savingsTarget", amount(data.plan?.savingsTarget ?? 0));
	rows(root, "limits", data.categories, (node, c) => {
		const input = select<HTMLInputElement>(node, "input");
		input.name = `limit:${c._id}`;
		input.value = amount(
			data.plan?.limits.find((x) => x.categoryId === c._id)?.amount ?? 0,
		);
		select(node, "[data-money-label]").textContent = c.name;
	});
	select(root, "[data-plan-incoming]").textContent = usd(data.funds.incoming);
	select(root, "[data-plan-carry]").textContent = usd(data.funds.carry);
	select(root, "[data-plan-outgoing]").textContent = usd(data.funds.outgoing);
	show(root, "people", Boolean(page.people));
	rows(root, "people", page.people ?? [], (node, person) => {
		args(node, {
			sharedId: space._id,
			privateId: person.privateId,
			month: page.month,
			revision: person.revision,
		});
		field(node, "amount", amount(person.amount));
		select(node, "[data-money-label]").textContent =
			`${person.name}'s personal amount`;
		disabled(node, !space.active || !person.active);
	});
	show(root, "repeat", Boolean(data.plan));
	op(root, "budgets:repeatPlan", { spaceId: space._id, month: page.month });
	text(root, "nextMonth", nextMonth(page.month));
	select<HTMLButtonElement>(root, '[data-op="budgets:repeatPlan"]').disabled =
		!space.active;
	disabled(form, !space.active);
}
function review(root: HTMLElement, page: PageData) {
	const data = page.dashboard!;
	summary(root, data);
	const form = select<HTMLFormElement>(root, "form");
	args(form, {
		spaceId: page.space!._id,
		month: page.month,
		revision: data.plan?.revision ?? 0,
	});
	const available = Math.max(0, data.savings - (data.plan?.savingsTarget ?? 0));
	form.dataset.available = String(available);
	form.dataset.savings = String(data.savings);
	form.dataset.saved = String(Boolean(data.plan?.saved));
	text(root, "available", usd(available));
	text(root, "month", page.month);
	text(root, "nextMonth", nextMonth(page.month));
	show(root, "notSaved", !data.plan?.saved);
	allocations(form, data.reserved, data.categories, nextMonth(page.month));
	select(root, "[data-review-save]").textContent = data.plan?.reviewed
		? "Update monthly review"
		: "Complete monthly review";
	disabled(root, !page.space!.active);
}
function categoryEditor(page: PageData, url: URL) {
	const root = template("editor-category");
	const categories = page.dashboard!.categories;
	const current = categories.find(
		(c) => c._id === url.searchParams.get("categoryEdit"),
	);
	options(
		select<HTMLSelectElement>(root, 'select[name="categoryEdit"]'),
		[
			{ value: "new", label: "Create a category" },
			...categoryOptions(categories),
		],
		current?._id ?? "new",
	);
	op(root, "budgets:saveCategory", {
		spaceId: page.space!._id,
		...(current ? { id: current._id, revision: current.revision } : {}),
	});
	field(root, "name", current?.name ?? "");
	field(root, "color", current?.color ?? "#83aaa2");
	text(root, "saveLabel", current ? "Save changes" : "Create category");
	show(root, "deleteCategory", Boolean(current));
	options(select<HTMLSelectElement>(root, 'select[name="replacementId"]'), [
		{ value: "", label: "Choose a category" },
		...categoryOptions(categories.filter((c) => c._id !== current?._id)),
	]);
	if (current)
		op(root, "budgets:deleteCategory", {
			id: current._id,
			revision: current.revision,
		});
	disabled(root, !page.space!.active);
	select<HTMLButtonElement>(
		root,
		'[data-op="budgets:deleteCategory"] button',
	).disabled = !page.space!.active;
	select<HTMLAnchorElement>(root, "[data-close-editor]").href = pageLink(url, {
		categoryEdit: null,
	});
	context(root, page);
	return root;
}
function transactionEditor(page: PageData, url: URL) {
	const root = template("editor-transaction");
	const entry = page.entry;
	const imported = entry?.source === "plaid";
	const categories = page.dashboard!.categories;
	text(root, "title", entry ? "Transaction details" : "Add a transaction");
	select<HTMLAnchorElement>(root, "[data-close-editor]").href = pageLink(url, {
		edit: null,
	});
	const form = select<HTMLFormElement>(
		root,
		'[data-op="budgets:saveTransaction"]',
	);
	args(form, {
		spaceId: page.space!._id,
		...(entry ? { id: entry._id } : {}),
		revision: entry?.revision ?? 0,
		...(imported ? { pending: entry.pending } : {}),
	});
	const account = select<HTMLSelectElement>(root, 'select[name="accountId"]');
	options(
		account,
		(page.accounts ?? [])
			.filter((a) => a.active || a._id === entry?.accountId)
			.map((a) => ({ value: a._id, label: a.name })),
		entry?.accountId,
	);
	account.disabled = Boolean(entry);
	const fixed = select<HTMLInputElement>(root, "[data-fixed-account]");
	fixed.disabled = !entry;
	fixed.value = entry?.accountId ?? "";
	show(root, "noAccount", !entry && !page.accounts?.some((a) => a.active));
	field(root, "description", entry?.description ?? "");
	field(root, "amount", amount(entry?.amount ?? 0));
	field(root, "date", entry?.date ?? `${page.month}-01`);
	field(root, "kind", entry?.kind ?? "purchase");
	field(root, "note", entry?.note ?? "");
	field(root, "pending", entry?.pending ?? false);
	select<HTMLInputElement>(root, 'input[name="amount"]').readOnly = imported;
	select<HTMLInputElement>(root, 'input[name="date"]').readOnly = imported;
	show(root, "imported", imported);
	text(root, "bankAmount", usd(entry?.amount ?? 0));
	show(root, "manualPending", !imported);
	const manual = entry?.source === "manual";
	show(root, "delete", manual);
	if (entry)
		op(root, "budgets:deleteTransaction", {
			id: entry._id,
			revision: entry.revision,
		});
	allocations(
		select(root, "[data-splits]"),
		entry?.splits.length
			? entry.splits
			: [{ categoryId: categories[0]?._id, amount: 0 }],
		categories,
	);
	show(root, "reconcile", manual && page.space!.active);
	if (entry)
		op(root, "budgets:reconcile", {
			manualId: entry._id,
			revision: entry.revision,
		});
	options(select<HTMLSelectElement>(root, 'select[name="importId"]'), [
		{ value: "", label: "Choose a matching entry" },
		...(page.imports?.rows ?? [])
			.filter((x) => x.source === "plaid" && x.amount === entry?.amount)
			.map((x) => ({
				value: x._id,
				label: `${x.date} · ${x.description} · ${usd(x.amount)}`,
			})),
	]);
	disabled(root, !page.space!.active);
	return root;
}
function transactions(root: HTMLElement, page: PageData, url: URL) {
	const p = url.searchParams;
	const categories = page.dashboard!.categories;
	const data = page.transactions!;
	show(root, "editable", page.space!.active);
	select<HTMLAnchorElement>(root, "[data-edit-category]").href = pageLink(url, {
		categoryEdit: "new",
		edit: null,
	});
	select<HTMLAnchorElement>(root, "[data-edit-transaction]").href = pageLink(
		url,
		{ edit: "new", categoryEdit: null },
	);
	const editor = select(root, "[data-editor]");
	if (p.has("categoryEdit")) editor.append(categoryEditor(page, url));
	if (p.has("edit")) editor.append(transactionEditor(page, url));
	const filters = select<HTMLFormElement>(root, "[data-filters]");
	field(filters, "search", p.get("search") ?? "");
	options(
		select<HTMLSelectElement>(filters, 'select[name="accountId"]'),
		[
			{ value: "", label: "All accounts" },
			...(page.accounts ?? []).map((a) => ({ value: a._id, label: a.name })),
		],
		p.get("accountId") ?? "",
	);
	options(
		select<HTMLSelectElement>(filters, 'select[name="categoryId"]'),
		[{ value: "", label: "All categories" }, ...categoryOptions(categories)],
		p.get("categoryId") ?? "",
	);
	rows(root, "transactions", data.rows, (node, x) => {
		text(node, "date", x.date);
		const link = select<HTMLAnchorElement>(node, "[data-transaction-link]");
		link.textContent = x.description;
		link.href = pageLink(url, { edit: x._id, categoryEdit: null });
		text(
			node,
			"detail",
			`${x.pending ? "Pending · " : ""}${x.source === "manual" ? "Manual" : x.kind}${x.note ? ` · ${x.note}` : ""}`,
		);
		text(
			node,
			"category",
			x.kind !== "purchase"
				? x.kind
				: x.splits.length > 1
					? `Split · ${x.splits.length} categories`
					: (categories.find((c) => c._id === x.splits[0]?.categoryId)?.name ??
						"Uncategorized"),
		);
		text(
			node,
			"account",
			page.accounts?.find((a) => a._id === x.accountId)?.name ?? "Account",
		);
		text(node, "amount", usd(-x.amount));
		select(node, '[data-text="amount"]').classList.toggle(
			"inflow",
			x.amount < 0,
		);
	});
	show(root, "empty", !data.rows.length);
	show(root, "pagination", Boolean(data.rows.length));
	text(root, "total", data.total);
	const first = select<HTMLAnchorElement>(root, '[data-page="first"]');
	first.hidden = !p.has("cursor");
	first.href = pageLink(url, { cursor: null, edit: null });
	const next = select<HTMLAnchorElement>(root, '[data-page="next"]');
	next.hidden = !data.next;
	next.href = pageLink(url, { cursor: data.next ?? null, edit: null });
	context(root, page);
}
function contributions(page: PageData) {
	const root = template("view-contributions");
	const data = page.contributions!;
	const base = {
		privateId: page.space!._id,
		sharedId: page.contributionSharedId,
		month: page.month,
	};
	op(root, "contributions:savePlanned", {
		...base,
		revision: data.contribution?.revision ?? 0,
	});
	field(root, "planned", amount(data.contribution?.planned ?? 0));
	select(root, "[data-money-label]").textContent =
		`Planned contribution for ${page.month}`;
	show(root, "noSuggestions", !data.suggestions.length);
	rows(root, "suggestions", data.suggestions, (node, x) => {
		text(node, "amount", usd(x.amount));
		text(
			node,
			"detail",
			`${x.date} · ${x.outDescription} → ${x.inDescription}`,
		);
		op(node, "contributions:confirm", {
			privateId: base.privateId,
			sharedId: base.sharedId,
			outId: x.outId,
			inId: x.inId,
		});
	});
	rows(root, "pairs", data.contribution?.pairs ?? [], (node, x) => {
		text(node, "amount", usd(x.amount));
		op(node, "contributions:unmatch", {
			id: data.contribution?._id,
			outId: x.outId,
			revision: data.contribution?.revision,
		});
	});
	return root;
}
function accounts(root: HTMLElement, page: PageData, url: URL) {
	const space = page.space!;
	const home = page.home!;
	const status = page.sharing;
	const destination = home.spaces.find((s) => s.active && s._id !== space._id);
	select<HTMLButtonElement>(root, "[data-bank-link]").disabled = !space.active;
	show(root, "bankReview", Boolean(page.bankReview));
	select<HTMLAnchorElement>(root, "[data-close-bank-review]").href = pageLink(
		url,
		{ bankReview: null },
	);
	op(root, "bank:confirmAccounts", { id: url.searchParams.get("bankReview") });
	rows(
		root,
		"decisions",
		page.bankReview?.filter((a) => a.possibleDuplicate) ?? [],
		(node, a) => {
			text(node, "account", `${a.name} · ${a.type} · ${a.mask}`);
			select<HTMLSelectElement>(node, "select").name =
				`decision:${a.accountId}`;
		},
	);
	show(root, "noAccounts", !page.accounts?.length);
	rows(root, "accounts", page.accounts ?? [], (node, a) => {
		text(node, "name", a.name);
		text(
			node,
			"detail",
			`${a.type} · ${a.mask} · ${a.active ? "Current assignment" : "Historical records"}`,
		);
		show(node, "editable", space.active);
		op(node, "accounts:rename", { id: a._id, revision: a.revision });
		field(node, "name", a.name);
		show(node, "move", Boolean(a.canMove && destination));
		text(
			node,
			"destination",
			destination ? `${destination.name} · ${destination.type}` : "",
		);
		if (destination)
			op(node, "accounts:move", {
				id: a._id,
				destinationId: destination._id,
				revision: a.revision,
			});
	});
	show(root, "noConnections", !page.connections?.length);
	rows(root, "connections", page.connections ?? [], (node, c) => {
		text(node, "institution", c.institution);
		text(
			node,
			"detail",
			`${c.status} · Last successful import: ${c.lastSync ? new Date(c.lastSync).toLocaleString("en-US", { timeZone: space.timeZone }) : "Not yet"}`,
		);
		show(node, "error", Boolean(c.error));
		text(node, "error", `${c.error ?? ""}. Imported history is retained.`);
		show(node, "review", c.status === "review");
		select<HTMLAnchorElement>(node, "[data-review-link]").href = pageLink(url, {
			bankReview: c._id,
		});
		for (const name of ["bank:sync", "bank:disconnect"])
			op(node, name, { id: c._id });
		select<HTMLButtonElement>(node, '[data-op="bank:sync"]').disabled = [
			"disconnected",
			"review",
			"discarding",
		].includes(c.status);
		const reconnect = select<HTMLButtonElement>(node, "[data-bank-link]");
		reconnect.dataset.bankLink = c._id;
		reconnect.disabled = ["disconnected", "review", "discarding"].includes(
			c.status,
		);
		select<HTMLButtonElement>(node, '[data-op="bank:disconnect"]').disabled =
			c.status === "disconnected";
	});
	const hasShared = home.spaces.some((s) => s.type === "shared" && s.active);
	const invite = url.searchParams.get("invite");
	show(root, "sharing", space.type === "shared" || !hasShared);
	show(root, "invite", Boolean(invite));
	op(root, "sharing:accept", { token: invite });
	show(root, "createShared", space.type === "private");
	show(root, "sharedDetails", space.type === "shared");
	show(root, "leave", space.active);
	op(root, "sharing:leave", { spaceId: space._id });
	text(
		root,
		"members",
		status?.members
			.map((x) => `${x.name}${x.active ? "" : " (left)"}`)
			.join(" & ") ?? "",
	);
	op(root, "sharing:invite", { spaceId: space._id });
	select<HTMLButtonElement>(
		root,
		'[data-op="sharing:invite"] button',
	).disabled =
		!space.active || (status?.members.filter((x) => x.active).length ?? 0) >= 2;
	rows(root, "invitations", status?.invitations ?? [], (node, x) => {
		text(node, "email", x.email);
		text(
			node,
			"detail",
			`${x.status} · email ${x.delivery} · expires ${new Date(x.expiresAt).toLocaleDateString("en-US", { timeZone: space.timeZone })}`,
		);
		show(node, "revoke", x.status === "pending");
		op(node, "sharing:revoke", { id: x._id });
		select<HTMLButtonElement>(node, "button").disabled = !space.active;
	});
	if (page.contributions)
		select(root, "[data-contributions]").append(contributions(page));
}
export function renderAuth(url: URL) {
	const p = url.searchParams;
	const requested = p.get("auth") ?? "login";
	const mode = p.has("token")
		? "reset"
		: ["login", "register", "request"].includes(requested)
			? requested
			: "login";
	const root = template(`auth-${mode}`);
	const invite = p.get("invite");
	if (invite)
		for (const link of all<HTMLAnchorElement>(root, "a[href]")) {
			const target = new URL(link.getAttribute("href") ?? "/", url);
			target.searchParams.set("invite", invite);
			link.href = target.pathname + target.search;
		}

	select<HTMLFormElement>(root, "form").dataset.token = p.get("token") ?? "";
	if (p.has("passwordUpdated"))
		select(root, "[data-message]").textContent =
			"Password updated. Sign in with your new password.";
	return root;
}
export function renderBudget(page: PageData, url: URL) {
	if (!page.home) return renderAuth(url);
	if (!page.home.profile) {
		const root = template("onboarding");
		field(root, "name", page.home.user.name);
		field(root, "timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);
		return root;
	}
	const root = template("budget-shell");
	const space = page.space!;
	options(
		select<HTMLSelectElement>(root, 'select[name="space"]'),
		page.home.spaces.map((s) => ({
			value: s._id,
			label: `${s.name}${s.active ? "" : " · previous membership"}`,
		})),
		space._id,
	);
	for (const node of all<HTMLInputElement>(root, 'input[name="month"]'))
		node.value = page.month;
	text(
		root,
		"household",
		space.type === "shared" ? "Our household" : "Personal",
	);
	text(
		root,
		"pageName",
		{
			overview: "Overview",
			transactions: "Transactions",
			budget: "Monthly budget",
			review: "Monthly review",
			accounts: "Accounts & settings",
			profile: "Settings",
		}[page.view as "overview"] ?? "Overview",
	);
	text(root, "initials", page.home.profile.name.slice(0, 2).toUpperCase());
	show(root, "left", !space.active);
	const unread = page.alerts?.filter((x) => !x.read).length ?? 0;
	show(root, "unread", unread > 0);
	show(root, "noAlerts", !page.alerts?.length);
	select(root, "[data-alert-summary]").setAttribute(
		"aria-label",
		`Alerts, ${unread} unread`,
	);
	rows(root, "alerts", page.alerts ?? [], (node, x) => {
		text(node, "message", x.text);
		const button = select<HTMLButtonElement>(node, "button");
		args(button, { spaceId: space._id, key: x.key });
		button.hidden = x.read;
	});
	const view = template(`view-${page.view}`);
	select(root, "[data-view-content]").append(view);
	if (page.view === "overview") overview(view, page, url);
	else if (page.view === "budget") plan(view, page);
	else if (page.view === "review") review(view, page);
	else if (page.view === "transactions") transactions(view, page, url);
	else if (page.view === "accounts") accounts(view, page, url);
	else {
		field(view, "name", page.home.profile.name);
		field(view, "timeZone", page.home.profile.timeZone);
		select<HTMLInputElement>(view, "[data-profile-email]").value =
			page.home.user.email;
	}
	context(root, page);
	navigation(root, page, url);
	return root;
}
