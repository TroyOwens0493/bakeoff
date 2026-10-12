import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { openPlaid } from "../lib/plaid-link";
import { ContributionsView } from "./ContributionsView";
import { Modal } from "./ui";
import type { ViewProps } from "./view-types";
export function AccountsView({
	spaceId,
	month,
	active,
	run,
	home,
}: ViewProps & { home: FunctionReturnType<typeof api.budgets.home> }) {
	const accounts = useQuery(api.accounts.list, { spaceId });
	const connections = useQuery(api.accounts.connections, {});
	const status = useQuery(api.sharing.status, { spaceId });
	const link = useAction(api.bank.link);
	const exchange = useAction(api.bank.exchange);
	const sync = useAction(api.bank.sync);
	const disconnect = useAction(api.bank.disconnect);
	const rename = useMutation(api.accounts.rename);
	const move = useMutation(api.accounts.move);
	const leave = useMutation(api.sharing.leave);
	const create = useMutation(api.sharing.create);
	const invite = useAction(api.sharing.invite);
	const revoke = useMutation(api.sharing.revoke);
	const accept = useAction(api.sharing.accept);
	const [reviewing, setReviewing] = useState<Id<"connections"> | null>(null);
	const [moving, setMoving] = useState<
		NonNullable<typeof accounts>[number] | null
	>(null);
	const space = home.spaces.find((x) => x._id === spaceId)!;
	const inviteToken =
		typeof window === "undefined"
			? null
			: new URLSearchParams(window.location.search).get("invite");
	return (
		<>
			{reviewing && (
				<AccountReview
					key={reviewing}
					id={reviewing}
					run={run}
					close={() => setReviewing(null)}
				/>
			)}
			<div className="page-actions">
				<div className="button-row">
					<button
						type="button"
						disabled={!active}
						onClick={() =>
							run(async () => {
								const token = await link({});
								await openPlaid(token, async (publicToken) => {
									const id = await exchange({ publicToken });
									setReviewing(id);
								});
							}, "Bank linked. Check for accounts that need review.")
						}
					>
						Connect a bank
					</button>
				</div>
			</div>
			<section className="panel">
				<h2>Accounts in this budget</h2>
				{accounts?.map((a) => (
					<div className="account-row" key={a._id}>
						<div>
							<strong>{a.name}</strong>
							<small>
								{a.type} · {a.mask} ·{" "}
								{a.active ? "Current assignment" : "Historical records"}
							</small>
						</div>
						<div className="button-row">
							{a.canMove && (
								<button
									type="button"
									className="secondary"
									disabled={!active}
									onClick={() => setMoving(a)}
								>
									Move account
								</button>
							)}
							<button
								type="button"
								className="secondary"
								disabled={!active || !a.active}
								onClick={() => {
									const name = window.prompt("Account name", a.name);
									if (name)
										void run(() =>
											rename({ id: a._id, name, revision: a.revision }),
										);
								}}
							>
								Rename
							</button>
						</div>
					</div>
				))}
				{!accounts?.length && (
					<p className="empty-state">
						No accounts yet. Connect a bank to import transactions
						automatically.
					</p>
				)}
			</section>
			<section className="panel">
				<h2>Your bank connections</h2>
				{connections?.map((c) => (
					<div className="connection-row" key={c._id}>
						<div>
							<strong>{c.institution}</strong>
							<small>
								{c.status} · Last successful import:{" "}
								{c.lastSync ? new Date(c.lastSync).toLocaleString() : "Not yet"}
							</small>
							{c.error && (
								<p className="over">{c.error}. Imported history is retained.</p>
							)}
						</div>
						<div className="button-row">
							{c.status === "review" && (
								<button type="button" onClick={() => setReviewing(c._id)}>
									Review accounts
								</button>
							)}
							<button
								type="button"
								className="secondary"
								disabled={["disconnected", "review", "discarding"].includes(
									c.status,
								)}
								onClick={() =>
									run(
										() => sync({ id: c._id }),
										"Sync requested. Check the connection status below.",
									)
								}
							>
								Sync
							</button>
							<button
								type="button"
								className="secondary"
								disabled={["disconnected", "review", "discarding"].includes(
									c.status,
								)}
								onClick={() =>
									run(async () => {
										const token = await link({ connectionId: c._id });
										await openPlaid(token, async () => {}, true);
										await sync({ id: c._id });
									}, "Reconnection completed.")
								}
							>
								Reconnect
							</button>
							<button
								type="button"
								className="text-button"
								disabled={c.status === "disconnected"}
								onClick={() => {
									if (
										window.confirm(
											"Disconnect this bank? Imported history will be kept.",
										)
									)
										void run(
											() => disconnect({ id: c._id }),
											"Disconnected. History retained.",
										);
								}}
							>
								Disconnect
							</button>
						</div>
					</div>
				))}
				{!connections?.length && <p>No bank connections yet.</p>}
			</section>
			<section className="panel narrow">
				<h2>Your shared budget</h2>
				{inviteToken && (
					<div className="banner">
						<p>
							You have an invitation. Accept it with the email address that
							received the invitation.
						</p>
						<button
							type="button"
							onClick={() =>
								run(async () => {
									await accept({ token: inviteToken });
									window.history.replaceState(null, "", "/");
								}, "Invitation accepted.")
							}
						>
							Accept invitation
						</button>
					</div>
				)}
				{space.type === "private" ? (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							const data = new FormData(e.currentTarget);
							void run(
								() => create({ name: String(data.get("name")) }),
								"Shared budget created. Select it to invite your partner.",
							);
						}}
					>
						<p>
							You can share one budget with one partner. Each of you has equal
							control. Your private budget remains separate.
						</p>
						<label>
							Shared budget name
							<input
								name="name"
								defaultValue="Our budget"
								required
								maxLength={100}
							/>
						</label>
						<button
							type="submit"
							disabled={home.spaces.some(
								(x) => x.type === "shared" && x.active,
							)}
						>
							Create shared budget
						</button>
					</form>
				) : (
					<>
						{active && (
							<button
								type="button"
								className="danger"
								onClick={() => {
									if (
										window.confirm(
											"Leave this shared budget? Your accounts return to your private budget. The other partner keeps this budget. You keep read access to previously shared records.",
										)
									)
										void run(
											() => leave({ spaceId }),
											"You left the shared budget.",
										);
								}}
							>
								Leave shared budget
							</button>
						)}
						<p>
							{status?.members
								.map((x) => `${x.name}${x.active ? "" : " (left)"}`)
								.join(" & ")}
						</p>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								const data = new FormData(e.currentTarget);
								void run(
									() => invite({ spaceId, email: String(data.get("email")) }),
									"Invitation queued for email delivery.",
								);
							}}
						>
							<label>
								Partner’s email
								<input name="email" type="email" required />
							</label>
							<button
								type="submit"
								disabled={
									!active ||
									(status?.members.filter((x) => x.active).length ?? 0) >= 2
								}
							>
								Send invitation
							</button>
						</form>
						{status?.invitations.map((x) => (
							<div className="alert-row" key={x._id}>
								<span>
									{x.email}
									<small>
										{x.status} · email {x.delivery} · expires{" "}
										{new Date(x.expiresAt).toLocaleDateString()}
									</small>
								</span>
								{x.status === "pending" && (
									<button
										type="button"
										className="text-button"
										onClick={() =>
											run(() => revoke({ id: x._id }), "Invitation revoked.")
										}
									>
										Revoke
									</button>
								)}
							</div>
						))}
					</>
				)}
			</section>
			{space.type === "private" &&
				home.spaces
					.filter((x) => x.type === "shared" && x.active)
					.map((x) => (
						<ContributionsView
							key={`${x._id}:${month}`}
							privateId={spaceId}
							sharedId={x._id}
							month={month}
							run={run}
						/>
					))}
			{moving && (
				<Modal title="Move account" onClose={() => setMoving(null)}>
					<p>
						Only transactions from today onward will be assigned to the
						destination budget. Earlier records stay in their current budget.
						Existing private history stays private. Earlier shared history
						remains available to both partners.
					</p>
					<form
						onSubmit={async (e) => {
							e.preventDefault();
							const data = new FormData(e.currentTarget);
							if (
								await run(
									() =>
										move({
											id: moving._id,
											destinationId: String(
												data.get("destination"),
											) as typeof spaceId,
											revision: moving.revision,
										}),
									"Account moved. Earlier history was kept in its original budget.",
								)
							)
								setMoving(null);
						}}
					>
						<label>
							Destination budget
							<select name="destination" required>
								{home.spaces
									.filter((x) => x.active && x._id !== spaceId)
									.map((x) => (
										<option key={x._id} value={x._id}>
											{x.name} · {x.type}
										</option>
									))}
							</select>
						</label>
						<button
							type="submit"
							disabled={!home.spaces.some((x) => x.active && x._id !== spaceId)}
						>
							Confirm account move
						</button>
					</form>
				</Modal>
			)}
		</>
	);
}

function AccountReview({
	id,
	run,
	close,
}: {
	id: Id<"connections">;
	run: ViewProps["run"];
	close: () => void;
}) {
	const accounts = useQuery(api.bank.review, { id });
	const confirm = useMutation(api.bank.confirmAccounts);
	const [decisions, setDecisions] = useState<Record<string, string>>({});
	if (accounts === undefined || accounts === null) return null;
	return (
		<Modal title="Check possible duplicate accounts" onClose={close}>
			<p>
				No transactions will import until you complete this check. A match uses
				the bank, account type, and last four digits of an account connected by
				you or your partner.
			</p>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					void run(async () => {
						await confirm({
							id,
							decisions: Object.entries(decisions).map(
								([accountId, value]) => ({
									accountId,
									sameAccount: value === "same",
								}),
							),
						});
						close();
					}, "Account review saved.");
				}}
			>
				{accounts
					.filter((a) => a.possibleDuplicate)
					.map((a) => (
						<label key={a.accountId}>
							{a.name} · {a.type} · {a.mask}
							<select
								required
								value={decisions[a.accountId] ?? ""}
								onChange={(e) =>
									setDecisions({ ...decisions, [a.accountId]: e.target.value })
								}
							>
								<option value="">Is this an account already connected?</option>
								<option value="same">
									Same account — keep the existing connection
								</option>
								<option value="different">
									Different account — import this account
								</option>
							</select>
						</label>
					))}
				<p>Other selected accounts will import with this connection.</p>
				<button type="submit">Confirm accounts</button>
			</form>
		</Modal>
	);
}
