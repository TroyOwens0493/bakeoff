import {
	createHash,
	scrypt as derive,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { promisify } from "node:util";
import type { AuthUser } from "./features/auth.ts";
import { sendEmail } from "./features/email.ts";
import type { Runtime } from "./runtime.ts";

const scrypt = promisify(derive);
const token = () => randomBytes(32).toString("hex");
const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex");
const cleanUser = (row: any): AuthUser => ({
	_id: row.id,
	id: row.id,
	name: row.name,
	email: row.email,
});
function text(value: unknown, maximum = 256) {
	if (typeof value !== "string" || !value.trim() || value.length > maximum)
		throw new Error("Enter a valid text value.");
	return value;
}
function password(value: unknown) {
	const p = text(value, 1024);
	if (p.length < 12)
		throw new Error("Use at least 12 characters for your password.");
	return p;
}
async function encode(value: string) {
	const salt = randomBytes(16).toString("hex");
	return `${salt}:${((await scrypt(value, salt, 64)) as Buffer).toString("hex")}`;
}
async function matches(value: string, stored: string) {
	const [salt, expected] = stored.split(":");
	const result = (await scrypt(value, salt, 64)) as Buffer;
	const bytes = Buffer.from(expected, "hex");
	return bytes.length === result.length && timingSafeEqual(bytes, result);
}
export class Auth {
	private runtime: Runtime;
	private attempts = new Map<string, { count: number; expires: number }>();
	constructor(runtime: Runtime) {
		this.runtime = runtime;
	}
	cookie(req: IncomingMessage) {
		return (
			req.headers.cookie
				?.split(";")
				.map((s) => s.trim())
				.find((s) => s.startsWith("budget_session="))
				?.slice("budget_session=".length) ?? ""
		);
	}
	async user(req: IncomingMessage): Promise<AuthUser | undefined> {
		const key = hash(this.cookie(req));
		return this.runtime.exclusive(async () => {
			const row = this.runtime.store.sql
				.prepare(
					"SELECT users.* FROM users JOIN sessions ON sessions.user_id=users.id WHERE sessions.token=? AND sessions.expires>?",
				)
				.get(key, Date.now());
			return row ? cleanUser(row) : undefined;
		});
	}
	private setCookie(res: ServerResponse, value: string, clear = false) {
		const secure = process.env.SITE_URL?.startsWith("https:") ? "; Secure" : "";
		res.setHeader(
			"Set-Cookie",
			`budget_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : 604800}${secure}`,
		);
	}
	private session(user: AuthUser, res: ServerResponse) {
		const value = token();
		this.runtime.store.sql
			.prepare("INSERT INTO sessions VALUES (?, ?, ?)")
			.run(hash(value), user.id, Date.now() + 604800000);
		this.setCookie(res, value);
		return { user };
	}
	private limit(req: IncomingMessage) {
		const key = req.socket.remoteAddress ?? "unknown";
		const now = Date.now();
		for (const [k, v] of this.attempts)
			if (v.expires <= now) this.attempts.delete(k);
		const entry = this.attempts.get(key) ?? { count: 0, expires: now + 900000 };
		if (++entry.count > 60)
			throw new Error("Too many authentication requests. Try again later.");
		this.attempts.set(key, entry);
	}
	async handle(
		path: string,
		body: any,
		req: IncomingMessage,
		res: ServerResponse,
	) {
		if (path === "session") return { user: (await this.user(req)) ?? null };
		this.limit(req);
		const sql = this.runtime.store.sql;
		if (path === "register") {
			const email = text(body.email).trim().toLowerCase();
			const name = text(body.name, 100).trim();
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
				throw new Error("Enter a valid email address.");
			const encoded = await encode(password(body.password));
			return this.runtime.exclusive(async () => {
				if (sql.prepare("SELECT id FROM users WHERE email=?").get(email))
					throw new Error("An account with this email already exists.");
				const id = `users:${token()}`;
				sql.exec("BEGIN IMMEDIATE");
				try {
					sql
						.prepare("INSERT INTO users VALUES (?, ?, ?, ?)")
						.run(id, email, name, encoded);
					const result = this.session({ _id: id, id, email, name }, res);
					sql.exec("COMMIT");
					return result;
				} catch (error) {
					sql.exec("ROLLBACK");
					throw error;
				}
			});
		}
		if (path === "login") {
			const email = text(body.email).trim().toLowerCase();
			const value = text(body.password, 1024);
			const row = await this.runtime.exclusive(async () =>
				sql.prepare("SELECT * FROM users WHERE email=?").get(email),
			);
			// Equal-cost hashing for unknown accounts limits email enumeration through timing.
			const valid = await matches(
				value,
				row
					? String(row.password)
					: `00000000000000000000000000000000:${"00".repeat(64)}`,
			);
			if (!row || !valid) throw new Error("Email or password is incorrect.");
			return this.runtime.exclusive(async () => {
				if (
					sql.prepare("SELECT password FROM users WHERE id=?").get(row.id)
						?.password !== row.password
				)
					throw new Error("Password changed. Sign in again.");
				return this.session(cleanUser(row), res);
			});
		}
		if (path === "logout") {
			await this.runtime.exclusive(async () => {
				sql
					.prepare("DELETE FROM sessions WHERE token=?")
					.run(hash(this.cookie(req)));
			});
			this.setCookie(res, "", true);
			return {};
		}
		if (path === "request-password-reset") {
			const email = text(body.email).trim().toLowerCase();
			const row = await this.runtime.exclusive(async () =>
				sql.prepare("SELECT * FROM users WHERE email=?").get(email),
			);
			if (row) {
				const value = token();
				await this.runtime.exclusive(async () => {
					sql
						.prepare("INSERT INTO resets VALUES (?, ?, ?)")
						.run(hash(value), row.id, Date.now() + 3600000);
				});
				try {
					await sendEmail(
						email,
						"Reset your Budget Together password",
						`Open this link to reset your password:\n${process.env.SITE_URL}/?auth=reset&token=${value}\nThis link expires in one hour.`,
						hash(value),
					);
				} catch {
					console.error(
						"Password reset email delivery failed. Check email configuration.",
					);
				}
			}
			return {};
		}
		if (path === "reset-password") {
			const value = text(body.token);
			const encoded = await encode(password(body.newPassword));
			return this.runtime.exclusive(async () => {
				const reset = sql
					.prepare("SELECT * FROM resets WHERE token=? AND expires>?")
					.get(hash(value), Date.now());
				if (!reset)
					throw new Error(
						"This reset link is invalid or expired. Request a new link.",
					);
				sql.exec("BEGIN IMMEDIATE");
				try {
					sql
						.prepare("UPDATE users SET password=? WHERE id=?")
						.run(encoded, reset.user_id);
					sql.prepare("DELETE FROM resets WHERE user_id=?").run(reset.user_id);
					sql
						.prepare("DELETE FROM sessions WHERE user_id=?")
						.run(reset.user_id);
					sql.exec("COMMIT");
					this.setCookie(res, "", true);
					return {};
				} catch (error) {
					sql.exec("ROLLBACK");
					throw error;
				}
			});
		}
		const user = await this.user(req);
		if (!user) throw new Error("Sign in to continue.");
		if (path === "update-user") {
			const name = text(body.name, 100).trim();
			await this.runtime.exclusive(async () => {
				sql.prepare("UPDATE users SET name=? WHERE id=?").run(name, user.id);
			});
			return {};
		}
		if (path === "change-password") {
			const current = text(body.currentPassword, 1024);
			const encoded = await encode(password(body.newPassword));
			const row = await this.runtime.exclusive(async () =>
				sql.prepare("SELECT password FROM users WHERE id=?").get(user.id),
			);
			if (!row || !(await matches(current, String(row.password))))
				throw new Error("Current password is incorrect.");
			return this.runtime.exclusive(async () => {
				sql.exec("BEGIN IMMEDIATE");
				try {
					const changed = sql
						.prepare("UPDATE users SET password=? WHERE id=? AND password=?")
						.run(encoded, user.id, row.password);
					if (!changed.changes)
						throw new Error("Password changed. Sign in and try again.");
					sql
						.prepare("DELETE FROM sessions WHERE user_id=? AND token<>?")
						.run(user.id, hash(this.cookie(req)));
					sql.exec("COMMIT");
					return {};
				} catch (error) {
					sql.exec("ROLLBACK");
					throw error;
				}
			});
		}
		throw new Error("Authentication route not found.");
	}
}
