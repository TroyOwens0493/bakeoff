import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { api } from "../../convex/_generated/api";
import { cents } from "../domain/budget";
import { authClient } from "../lib/auth-client";
import { type Args, formArgs } from "../lib/form-args";
import { loadBudget } from "../lib/load-budget";
import { type PageData, usd, type Watch } from "../lib/page-data";
import { openPlaid } from "../lib/plaid-link";
import { renderAuth, renderBudget } from "../lib/render";

type PageState = {
	convexUrl: string;
	authenticated: boolean;
	spaceId?: string;
	month: string;
	active?: boolean;
	ensureMonth: boolean;
	watches: Watch[];
};
let client: ConvexClient | undefined;
let currentUserId: string | undefined;
let state: PageState | null = null;
let stops: (() => void)[] = [];
let busy = false;
let refreshing = false;
let pendingRefresh: { url: URL; force: boolean } | null = null;
let renderedUrl = new URL(location.href);
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const $ = <T extends Element = HTMLElement>(
	selector: string,
	parent: ParentNode = document,
) => parent.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(
	selector: string,
	parent: ParentNode = document,
) => [...parent.querySelectorAll<T>(selector)];
const isDirty = () => Boolean($("form[data-dirty]"));

function message(text: string, form?: HTMLFormElement, error = false) {
	const target = form
		? $("[data-message]", form)
		: ($("[data-global-message]") ?? $("[data-startup-message]"));
	if (!form && !$("[data-global-message]")) {
		const startup = $("[data-startup-error]");
		if (startup) startup.hidden = !text;
	}
	if (!target) return;
	target.textContent = text;
	target.hidden = !text;
	target.setAttribute("role", error ? "alert" : "status");
	target.classList.toggle("error-banner", error);
}

function pending() {
	const banner = $("[data-live-change]");
	if (banner) banner.hidden = false;
}

async function refresh(url = new URL(location.href), force = false) {
	if (refreshing) {
		pendingRefresh = { url, force };
		return;
	}
	if (!force && (isDirty() || busy)) {
		pending();
		return;
	}
	refreshing = true;
	const status = $("[data-session-status]");
	if (status && !state) status.hidden = false;
	try {
		const session = await authClient.getSession();
		if (session.error)
			throw new Error(session.error.message ?? "Could not check your session.");
		let page: PageData | null = null;
		if (session.data?.user) {
			if (currentUserId && currentUserId !== session.data.user.id) {
				for (const stop of stops) stop();
				stops = [];
				await client?.close();
				client = undefined;
				state = null;
				const root = $("#app-content");
				if (root) root.textContent = "Loading your budget…";
			}
			currentUserId = session.data.user.id;
			const convexUrl = import.meta.env.VITE_CONVEX_URL;
			if (!convexUrl)
				throw new Error(
					"Set VITE_CONVEX_URL in .env.local and start the app again.",
				);
			if (!client) {
				client = new ConvexClient(convexUrl);
				client.setAuth(async () => {
					const result = await authClient.convex.token();
					return result.data?.token ?? null;
				});
			}
			const activeClient = client;
			page = await loadBudget(
				url,
				(query, args) => activeClient.query(query, args),
				convexUrl,
			);
		} else if (client) {
			await client.close();
			client = undefined;
			currentUserId = undefined;
		}
		for (const stop of stops) stop();
		stops = [];
		state = page
			? {
					convexUrl: page.convexUrl,
					authenticated: true,
					spaceId: page.space?._id,
					month: page.month,
					active: page.space?.active,
					ensureMonth: Boolean(page.space?.active && !page.dashboard?.plan),
					watches: page.watches,
				}
			: null;
		$("#app-content")?.replaceChildren(
			page ? renderBudget(page, url) : renderAuth(url),
		);
		renderedUrl = new URL(url);
		if (!pendingRefresh) history.replaceState(null, "", url);
		const startup = $("[data-startup-error]");
		if (startup) startup.hidden = true;
		if (status) status.hidden = true;
		await connect();
	} catch (error) {
		if (status) status.hidden = true;
		message(
			error instanceof Error
				? error.message
				: "Could not load your budget. Try again.",
			undefined,
			true,
		);
	} finally {
		refreshing = false;
		if (pendingRefresh) {
			const next = pendingRefresh;
			pendingRefresh = null;
			void refresh(next.url, next.force);
		}
	}
}

function changed() {
	clearTimeout(refreshTimer);
	refreshTimer = setTimeout(() => {
		void refresh();
	}, 150);
}

function recalculate(form: HTMLFormElement) {
	try {
		const value = (name: string) =>
			$<HTMLInputElement>(`input[name="${name}"]`, form)?.value ?? "";
		const set = (selector: string, value: number) => {
			const node = $(selector, form);
			if (node) node.textContent = usd(value);
		};
		if (form.dataset.transform === "plan") {
			const income = cents(value("expectedIncome"));
			const target = cents(value("savingsTarget"));
			const total = $$<HTMLInputElement>('input[name^="limit:"]', form).reduce(
				(sum, input) => sum + cents(input.value),
				0,
			);
			const available =
				income + Number(form.dataset.incoming) + Number(form.dataset.carry);
			const balance =
				available - Number(form.dataset.outgoing) - target - total;
			set("[data-plan-available]", available);
			set("[data-plan-income]", income);
			set("[data-plan-limits]", total);
			set("[data-plan-target]", target);
			set("[data-plan-balance]", balance);
			const hint = $("[data-plan-hint]", form);
			if (hint)
				hint.textContent =
					balance === 0
						? "✓ Every dollar has a place."
						: "Adjust your plan until this amount is zero.";
			const save = $<HTMLButtonElement>('button[type="submit"]', form);
			if (save) save.disabled = !state?.active || balance !== 0;
		}
		if (form.dataset.transform === "review") {
			const total = $$<HTMLInputElement>(
				'input[name="allocationAmount"]',
				form,
			).reduce((sum, input) => sum + cents(input.value), 0);
			set("[data-review-remaining]", Number(form.dataset.available) - total);
			set("[data-review-reserved]", total);
			set("[data-review-retained]", Number(form.dataset.savings) - total);
			const save = $<HTMLButtonElement>('button[type="submit"]', form);
			if (save)
				save.disabled =
					!state?.active ||
					total > Number(form.dataset.available) ||
					form.dataset.saved !== "true";
		}
	} catch {
		const save = $<HTMLButtonElement>('button[type="submit"]', form);
		if (save) save.disabled = true;
	}
}

function classification(select: HTMLSelectElement) {
	const splits = $("[data-splits]", select.form ?? document);
	if (!splits) return;
	splits.hidden = select.value !== "purchase";
	for (const field of $$<HTMLInputElement | HTMLSelectElement>(
		"input,select",
		splits,
	))
		field.disabled = splits.hidden;
}

async function connect() {
	for (const input of $$<HTMLInputElement>("[data-local-timezone]"))
		input.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
	for (const select of $$<HTMLSelectElement>("[data-classification]"))
		classification(select);
	for (const form of $$<HTMLFormElement>(
		'form[data-transform="plan"],form[data-transform="review"]',
	))
		recalculate(form);
	if (!state?.authenticated || !client) return;
	for (const watch of state.watches) {
		stops.push(
			client.onUpdate(
				makeFunctionReference<"query">(watch.name),
				watch.args as Args,
				(value) => {
					if (JSON.stringify(value) !== watch.value) changed();
				},
				() =>
					message(
						"Live updates are unavailable. Use Load current values to try again.",
						undefined,
						true,
					),
			),
		);
	}
	if (state.ensureMonth && state.spaceId)
		await client
			.mutation(api.budgets.ensureMonth, {
				spaceId: state.spaceId as never,
				month: state.month,
			})
			.catch((error) => message(error.message, undefined, true));
}

async function call(op: string, args: Args, kind = "mutation") {
	if (!client) throw new Error("Sign in and try again.");
	return kind === "action"
		? client.action(makeFunctionReference<"action">(op), args)
		: client.mutation(makeFunctionReference<"mutation">(op), args);
}

async function saved(op: string, text = "Saved.", form?: HTMLFormElement) {
	if (form) delete form.dataset.dirty;
	const url = new URL(location.href);
	for (const key of ["edit", "categoryEdit", "bankReview"])
		url.searchParams.delete(key);
	if (op === "sharing:accept") url.searchParams.delete("invite");
	if (op === "sharing:create") url.searchParams.delete("space");
	if (!isDirty()) await refresh(url, true);
	else pending();
	message(text);
}

async function authenticate(form: HTMLFormElement) {
	const data = new FormData(form);
	const get = (key: string) => String(data.get(key) ?? "");
	const mode = form.dataset.auth;
	let result: { error: { message?: string } | null };
	if (mode === "login")
		result = await authClient.signIn.email({
			email: get("email"),
			password: get("password"),
		});
	else if (mode === "register")
		result = await authClient.signUp.email({
			name: get("name"),
			email: get("email"),
			password: get("password"),
		});
	else if (mode === "request")
		result = await authClient.requestPasswordReset({
			email: get("email"),
			redirectTo: `${location.origin}/`,
		});
	else if (mode === "changePassword")
		result = await authClient.changePassword({
			currentPassword: get("currentPassword"),
			newPassword: get("newPassword"),
			revokeOtherSessions: true,
		});
	else
		result = await authClient.resetPassword({
			newPassword: get("password"),
			token: form.dataset.token ?? "",
		});
	if (result.error)
		throw new Error(result.error.message ?? "Please try again.");
	delete form.dataset.dirty;
	if (mode === "request")
		message("If this email has an account, a reset link will be sent.", form);
	else if (mode === "changePassword") {
		form.reset();
		message("Password updated.", form);
	} else if (mode === "reset") {
		await refresh(
			new URL("/?auth=login&passwordUpdated=1", location.origin),
			true,
		);
	} else {
		await refresh(new URL(location.href), true);
	}
}

document.addEventListener("submit", async (event) => {
	const form = event.target;
	if (
		form instanceof HTMLFormElement &&
		!form.dataset.op &&
		!form.dataset.auth &&
		!form.hasAttribute("data-profile") &&
		form.method.toLowerCase() === "get"
	) {
		event.preventDefault();
		if (isDirty() && !confirm("Discard unsaved entries and open this view?"))
			return;
		const url = new URL(location.pathname, location.origin);
		for (const [key, value] of new FormData(form))
			if (typeof value === "string" && value) url.searchParams.set(key, value);
		history.pushState(null, "", url);
		await refresh(url, true);
		return;
	}
	if (
		!(form instanceof HTMLFormElement) ||
		!(form.dataset.op || form.dataset.auth || form.hasAttribute("data-profile"))
	)
		return;
	event.preventDefault();
	if (busy) return;
	if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
	busy = true;
	form.inert = true;
	const buttons = $$<HTMLButtonElement>('button[type="submit"]', form);
	for (const button of buttons) button.disabled = true;
	message("", form);
	try {
		if (form.dataset.auth) await authenticate(form);
		else {
			const args = formArgs(
				new FormData(form),
				JSON.parse(form.dataset.args ?? "{}") as Args,
				form.dataset.transform,
				form.dataset.money,
			);
			if (form.hasAttribute("data-profile")) {
				const result = await authClient.updateUser({ name: String(args.name) });
				if (result.error) throw new Error(result.error.message);
				await call("budgets:setup", args);
			} else await call(form.dataset.op!, args, form.dataset.kind);
			await saved(
				form.dataset.op ?? "profile",
				form.dataset.success ?? "Saved.",
				form,
			);
		}
	} catch (error) {
		message(
			error instanceof Error ? error.message : "The request failed. Try again.",
			form,
			true,
		);
	} finally {
		busy = false;
		form.inert = false;
		for (const button of buttons) button.disabled = false;
		recalculate(form);
	}
});

document.addEventListener("click", async (event) => {
	const link =
		event.target instanceof Element
			? event.target.closest<HTMLAnchorElement>("a[href]")
			: null;
	if (
		link &&
		event instanceof MouseEvent &&
		event.button === 0 &&
		!event.ctrlKey &&
		!event.metaKey &&
		!event.shiftKey &&
		!event.altKey &&
		!link.target &&
		!link.hasAttribute("download")
	) {
		const url = new URL(link.href, location.href);
		if (url.origin === location.origin && url.pathname === location.pathname) {
			event.preventDefault();
			if (isDirty() && !confirm("Discard unsaved entries and open this view?"))
				return;
			history.pushState(null, "", url);
			await refresh(url, true);
			return;
		}
	}

	const element =
		event.target instanceof Element
			? event.target.closest<HTMLElement>("button")
			: null;
	if (!element) return;
	if (element.hasAttribute("data-add-row")) {
		const section = element.closest("[data-splits]") ?? element.closest("form");
		const template = section
			? $<HTMLTemplateElement>("[data-row-template]", section)
			: null;
		const rows = section ? $("[data-rows]", section) : null;
		if (template && rows) rows.append(template.content.cloneNode(true));
		const form = element.closest("form");
		if (form) {
			form.dataset.dirty = "true";
			recalculate(form);
		}
		return;
	}
	if (element.hasAttribute("data-remove-row")) {
		const form = element.closest("form");
		element.closest("[data-allocation-row]")?.remove();
		if (form) {
			form.dataset.dirty = "true";
			recalculate(form);
		}
		return;
	}
	if (element.hasAttribute("data-reload")) {
		if (
			!isDirty() ||
			confirm("Discard unsaved entries and load current values?")
		)
			await refresh(new URL(location.href), true);
		return;
	}
	if (busy) return;
	if (
		!(
			element.dataset.op ||
			element.hasAttribute("data-bank-link") ||
			element.hasAttribute("data-sign-out")
		)
	)
		return;
	if (element.dataset.confirm && !confirm(element.dataset.confirm)) return;
	busy = true;
	element.setAttribute("disabled", "");
	try {
		if (element.hasAttribute("data-sign-out")) {
			const result = await authClient.signOut();
			if (result.error) throw new Error(result.error.message);
			for (const form of $$("form[data-dirty]"))
				form.removeAttribute("data-dirty");
			await refresh(new URL(location.href), true);
			return;
		}
		if (element.hasAttribute("data-bank-link")) {
			const id = element.dataset.bankLink;
			const token = (await call(
				"bank:link",
				id ? { connectionId: id } : {},
				"action",
			)) as string;
			let connectionId: string | undefined;
			await openPlaid(
				token,
				async (publicToken) => {
					connectionId = (await call(
						"bank:exchange",
						{ publicToken },
						"action",
					)) as string;
				},
				Boolean(id),
			);
			if (id) await call("bank:sync", { id }, "action");
			const url = new URL(location.href);
			if (connectionId) {
				url.searchParams.set("view", "accounts");
				url.searchParams.set("bankReview", connectionId);
			}
			await refresh(url, true);
			message("Bank connection updated.");
		} else {
			await call(
				element.dataset.op!,
				JSON.parse(element.dataset.args ?? "{}") as Args,
				element.dataset.kind,
			);
			await saved(
				element.dataset.op!,
				element.dataset.success ?? "Saved.",
				element.closest("form") ?? undefined,
			);
		}
	} catch (error) {
		message(
			error instanceof Error ? error.message : "The request failed. Try again.",
			undefined,
			true,
		);
	} finally {
		busy = false;
		element.removeAttribute("disabled");
	}
});

document.addEventListener("input", (event) => {
	const input = event.target;
	if (
		!(
			input instanceof HTMLInputElement ||
			input instanceof HTMLSelectElement ||
			input instanceof HTMLTextAreaElement
		)
	)
		return;
	const form = input.form;
	if (
		form &&
		(form.dataset.op || form.hasAttribute("data-profile") || form.dataset.auth)
	) {
		form.dataset.dirty = "true";
		recalculate(form);
	}
});
document.addEventListener("change", (event) => {
	const input = event.target;
	if (
		!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)
	)
		return;
	if (input.hasAttribute("data-navigate-select") && input.form)
		input.form.requestSubmit();
	if (
		input instanceof HTMLSelectElement &&
		input.hasAttribute("data-classification")
	)
		classification(input);
});
window.addEventListener("popstate", () => {
	if (isDirty() && !confirm("Discard unsaved entries and open this view?")) {
		history.pushState(null, "", renderedUrl);
		return;
	}
	void refresh(new URL(location.href), true);
});
window.addEventListener("beforeunload", (event) => {
	if (isDirty()) event.preventDefault();
});
void refresh(new URL(location.href), true);
