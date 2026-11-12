import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { now } from "./clock";
import schema from "./features/schema.ts";
import { validateFields } from "./validation.ts";

type Row = Record<string, any> & { _id: string; _creationTime: number };
type Definition = { fields: unknown; indexes: Record<string, string[]> };
const tables = (schema as unknown as { tables: Record<string, Definition> })
	.tables;
/** SQLite owns persistence and indexes; domain modules own access and accounting rules. */
export class Store {
	sql: DatabaseSync;
	constructor(path: string) {
		this.sql = new DatabaseSync(path);
		this.sql.exec(
			"PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
		);
		for (const [name, definition] of Object.entries(tables)) {
			this.sql.exec(
				`CREATE TABLE IF NOT EXISTS "${name}" (id TEXT PRIMARY KEY, created REAL NOT NULL, data TEXT NOT NULL CHECK(json_valid(data))) STRICT`,
			);
			for (const [index, fields] of Object.entries(definition.indexes)) {
				this.sql.exec(
					`CREATE INDEX IF NOT EXISTS "${name}_${index}" ON "${name}" (${fields.map((f) => `json_extract(data, '$.${f}')`).join(",")})`,
				);
			}
		}
		this.sql.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS resets (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL) STRICT;
   CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, operation TEXT NOT NULL, args TEXT NOT NULL, due INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT) STRICT;`);
	}
	table(name: string) {
		if (!Object.hasOwn(tables, name)) throw new Error("Unknown table.");
		return `"${name}"`;
	}
	decode(row: any): Row | null {
		return row
			? { ...JSON.parse(row.data), _id: row.id, _creationTime: row.created }
			: null;
	}
	async get(id: string) {
		const table = id.split(":")[0];
		return this.decode(
			this.sql.prepare(`SELECT * FROM ${this.table(table)} WHERE id=?`).get(id),
		);
	}
	async insert(table: string, value: Record<string, unknown>) {
		validateFields(tables[table].fields, value);
		const id = `${table}:${randomUUID()}`;
		this.sql
			.prepare(`INSERT INTO ${this.table(table)} VALUES (?, ?, ?)`)
			.run(id, now(), JSON.stringify(value));
		return id;
	}
	async patch(id: string, patch: Record<string, unknown>) {
		const row = await this.get(id);
		if (!row) throw new Error("Record not found.");
		const { _id, _creationTime, ...data } = { ...row, ...patch };
		for (const key of Object.keys(data))
			if (data[key] === undefined) delete data[key];
		validateFields(tables[id.split(":")[0]].fields, data);
		this.sql
			.prepare(`UPDATE ${this.table(id.split(":")[0])} SET data=? WHERE id=?`)
			.run(JSON.stringify(data), id);
	}
	async delete(id: string) {
		this.sql
			.prepare(`DELETE FROM ${this.table(id.split(":")[0])} WHERE id=?`)
			.run(id);
	}
	query(table: string) {
		const clauses: string[] = [];
		const params: (string | number | null)[] = [];
		const filters: ((r: Row) => boolean)[] = [];
		let orderFields = ["_creationTime"];
		let direction = "ASC";
		const expression = (field: string) => {
			if (!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(field))
				throw new Error("Invalid field.");
			return field === "_creationTime"
				? "created"
				: field === "_id"
					? "id"
					: `json_extract(data, '$.${field}')`;
		};
		const range: Record<string, (field: string, value: any) => typeof range> =
			{};
		for (const [name, operator] of Object.entries({
			eq: "=",
			gte: ">=",
			gt: ">",
			lt: "<",
			lte: "<=",
		})) {
			range[name] = (field, value) => {
				clauses.push(`${expression(field)} ${operator} ?`);
				params.push(typeof value === "boolean" ? Number(value) : value);
				return range;
			};
		}
		const rows = () =>
			(
				this.sql
					.prepare(
						`SELECT * FROM ${this.table(table)} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY ${orderFields
							.map(expression)
							.map((f) => `${f} ${direction}`)
							.join(",")}, id ${direction}`,
					)
					.all(...params)
					.map((r) => this.decode(r)!) as Row[]
			).filter((r) => filters.every((f) => f(r)));
		const field = (name: string) => (row: Row) => row[name];
		const val = (v: any, row: Row) => (typeof v === "function" ? v(row) : v);
		const query = {
			withIndex: (name: string, fn?: (r: typeof range) => unknown) => {
				orderFields = tables[table].indexes[name];
				if (!orderFields) throw new Error("Unknown index.");
				fn?.(range);
				return query;
			},
			filter: (fn: (q: any) => (r: Row) => boolean) => {
				filters.push(
					fn({
						field,
						eq: (a: any, b: any) => (r: Row) => val(a, r) === val(b, r),
						lte: (a: any, b: any) => (r: Row) => val(a, r) <= val(b, r),
					}),
				);
				return query;
			},
			order: (value: string) => {
				direction = value === "desc" ? "DESC" : "ASC";
				return query;
			},
			collect: async () => rows(),
			first: async () => rows()[0] ?? null,
			unique: async () => {
				const found = rows();
				if (found.length > 1) throw new Error("Duplicate records.");
				return found[0] ?? null;
			},
		};
		return query;
	}
	close() {
		this.sql.close();
	}
}
