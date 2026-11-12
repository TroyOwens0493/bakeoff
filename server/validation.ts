/** Local runtime validation. The migrated type contracts are compile-time only. */
import type { Id } from "./contracts";
export class DomainError extends Error {}
export type Validator<T = unknown, Optional extends boolean = boolean> = {
	parse(value: unknown, path?: string): T;
	optional?: Optional;
	readonly type?: T;
};
type Infer<V> = V extends Validator<infer T> ? T : never;
export type InferFields<F extends Record<string, Validator<any>>> = {
	[K in keyof F as F[K] extends Validator<any, true> ? never : K]: Infer<F[K]>;
} & {
	[K in keyof F as F[K] extends Validator<any, true> ? K : never]?: Infer<F[K]>;
};

const validator = (
	check: (value: unknown) => boolean,
	message: string,
): Validator =>
	({
		parse(value, path = "Input") {
			if (!check(value)) throw new DomainError(`${path}: ${message}`);
			return value;
		},
	}) as Validator;
function object(fields: Record<string, Validator>): Validator {
	return {
		parse(value, path = "Input") {
			if (!value || typeof value !== "object" || Array.isArray(value))
				throw new DomainError(`${path}: expected an object.`);
			const source = value as Record<string, unknown>;
			for (const key of Object.keys(source))
				if (!Object.hasOwn(fields, key))
					throw new DomainError(`${path}: unexpected field ${key}.`);
			for (const [key, rule] of Object.entries(fields))
				rule.parse(source[key], `${path}.${key}`);
			return value;
		},
	};
}
const rules = {
	string: () =>
		validator(
			(v) => typeof v === "string" && v.length <= 100000,
			"expected text.",
		),
	number: () =>
		validator(
			(v) => typeof v === "number" && Number.isFinite(v),
			"expected a finite number.",
		),
	boolean: () =>
		validator((v) => typeof v === "boolean", "expected true or false."),
	null: () => validator((v) => v === null, "expected null."),
	id: (table: string) =>
		validator(
			(v) =>
				typeof v === "string" && new RegExp(`^${table}:[a-zA-Z0-9-]+$`).test(v),
			"invalid record ID.",
		),
	literal: (expected: unknown) =>
		validator((v) => v === expected, `expected ${String(expected)}.`),
	optional: (rule: Validator): Validator => ({
		optional: true,
		parse: (v, p) => (v === undefined ? v : rule.parse(v, p)),
	}),
	array: (rule: Validator): Validator => ({
		parse(v, p) {
			if (!Array.isArray(v) || v.length > 10000)
				throw new DomainError(`${p}: expected a bounded array.`);
			v.forEach((item, i) => {
				rule.parse(item, `${p}[${i}]`);
			});
			return v;
		},
	}),
	union: (...choices: Validator[]): Validator => ({
		parse(v, p) {
			for (const c of choices) {
				try {
					return c.parse(v, p);
				} catch {}
			}
			throw new DomainError(`${p}: invalid value.`);
		},
	}),
	object,
};
export const v = rules as unknown as {
	string(): Validator<string, false>;
	number(): Validator<number, false>;
	boolean(): Validator<boolean, false>;
	null(): Validator<null, false>;
	id<T extends string>(table: T): Validator<Id<T>, false>;
	literal<T extends string | boolean | number>(value: T): Validator<T, false>;
	optional<T>(rule: Validator<T>): Validator<T, true>;
	array<T>(rule: Validator<T>): Validator<T[], false>;
	union<V extends Validator<any>[]>(
		...rules: V
	): Validator<Infer<V[number]>, false>;
	object<F extends Record<string, Validator<any>>>(
		fields: F,
	): Validator<InferFields<F>, false>;
};
export function defineTable<F extends Record<string, Validator<any>>>(
	fields: F,
) {
	return {
		fields,
		indexes: {} as Record<string, string[]>,
		index(name: string, columns: string[]) {
			this.indexes[name] = columns;
			return this;
		},
	};
}
export function defineSchema<T>(tables: T) {
	return { tables };
}

export function register(kind: string, visibility: string) {
	return (definition: {
		args: Record<string, Validator>;
		handler: (...args: any[]) => any;
	}) => ({
		kind,
		visibility,
		_handler: definition.handler,
		validate: object(definition.args).parse,
	});
}
export function validateFields(fields: unknown, value: unknown) {
	return object(fields as Record<string, Validator>).parse(value);
}
