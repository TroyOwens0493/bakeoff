import { randomUUID } from "node:crypto";
import * as accounts from "./features/accounts.ts";
import type { AuthUser } from "./features/auth.ts";
import * as bank from "./features/bank.ts";
import * as budgets from "./features/budgets.ts";
import * as contributions from "./features/contributions.ts";
import * as email from "./features/email.ts";
import * as personalAllocations from "./features/personalAllocations.ts";
import * as sharing from "./features/sharing.ts";
import type { Store } from "./store.ts";

type Operation = {
	kind: string;
	visibility: string;
	validate: (args: unknown) => unknown;
	_handler: (ctx: any, args: any) => any;
};
const modules = {
	budgets,
	accounts,
	sharing,
	bank,
	personalAllocations,
	contributions,
	email,
};
export class Runtime {
	store: Store;
	private tail: Promise<unknown> = Promise.resolve();
	constructor(store: Store) {
		this.store = store;
	}
	async exclusive<T>(fn: () => Promise<T>): Promise<T> {
		const pending = this.tail.then(fn);
		this.tail = pending.catch(() => {});
		return pending;
	}
	operation(key: string) {
		const [module, name] = key.split(":");
		const operation = (modules as any)[module]?.[name] as Operation;
		if (!operation?._handler) throw new Error("Operation not found.");
		return operation;
	}
	async invoke(
		key: string,
		args: unknown,
		currentUser?: AuthUser,
		internal = false,
	): Promise<any> {
		const op = this.operation(key);
		if (!internal && op.visibility !== "public")
			throw new Error("Operation not found.");
		op.validate(args);
		const context = {
			db: this.store,
			currentUser,
			runQuery: (ref: string, values: unknown) =>
				this.invoke(String(ref), values, currentUser, true),
			runMutation: (ref: string, values: unknown) =>
				this.invoke(String(ref), values, currentUser, true),
			runAction: (ref: string, values: unknown) =>
				this.invoke(String(ref), values, currentUser, true),
			scheduler: {
				runAfter: async (delay: number, ref: string, values: unknown) => {
					const schedule = async () => {
						const id = randomUUID();
						this.store.sql
							.prepare(
								"INSERT INTO jobs (id, operation, args, due) VALUES (?, ?, ?, ?)",
							)
							.run(id, String(ref), JSON.stringify(values), Date.now() + delay);
						return id;
					};
					return op.kind === "action" ? this.exclusive(schedule) : schedule();
				},
			},
		};
		if (op.kind === "action") return op._handler(context, args);
		return this.exclusive(async () => {
			this.store.sql.exec(op.kind === "mutation" ? "BEGIN IMMEDIATE" : "BEGIN");
			try {
				const result = await op._handler(context, args);
				this.store.sql.exec("COMMIT");
				return result;
			} catch (error) {
				this.store.sql.exec("ROLLBACK");
				throw error;
			}
		});
	}
	private draining = false;
	async drainJobs() {
		if (this.draining) return;
		this.draining = true;
		try {
			const jobs = await this.exclusive(async () =>
				this.store.sql
					.prepare(
						"SELECT * FROM jobs WHERE due <= ? AND attempts < 5 ORDER BY due LIMIT 20",
					)
					.all(Date.now()),
			);
			for (const job of jobs) {
				try {
					await this.invoke(
						String(job.operation),
						JSON.parse(String(job.args)),
						undefined,
						true,
					);
					await this.exclusive(async () => {
						this.store.sql.prepare("DELETE FROM jobs WHERE id=?").run(job.id);
					});
				} catch (error) {
					await this.exclusive(async () => {
						this.store.sql
							.prepare(
								"UPDATE jobs SET attempts=attempts+1, due=?, error=? WHERE id=?",
							)
							.run(
								Date.now() + 60000,
								error instanceof Error ? error.message : "Job failed",
								job.id,
							);
					});
				}
			}
		} finally {
			this.draining = false;
		}
	}
}
