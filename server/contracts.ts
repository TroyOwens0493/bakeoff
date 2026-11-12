/** Shared compile-time contracts for the local domain engine and browser REST client. */

import type { AuthUser } from "./features/auth";
import type schema from "./features/schema";
import type { InferFields, Validator } from "./validation";
export type Id<T extends string> = string & { readonly __table: T };
export type TableNames = keyof typeof schema.tables;
export type Doc<T extends TableNames> = InferFields<
	(typeof schema.tables)[T]["fields"]
> & { _id: Id<T>; _creationTime: number };
export type DataModel = { [T in TableNames]: { document: Doc<T> } };
export type Value =
	| null
	| boolean
	| number
	| string
	| Value[]
	| { [key: string]: Value | undefined };
export type FunctionReference<
	K extends string = string,
	V extends string = "public",
	A = any,
	R = any,
> = string & {
	readonly _kind: K;
	readonly _visibility: V;
	readonly _args: A;
	readonly _result: R;
};
export type FunctionArgs<F> = F extends { readonly _args: infer A } ? A : never;
export type FunctionReturnType<F> = F extends { readonly _result: infer R }
	? R
	: never;
export type RegisteredQuery<V extends string, A, R> = {
	readonly _kind: "query";
	readonly _visibility: V;
	readonly _args: A;
	readonly _result: R;
};
export type RegisteredMutation<V extends string, A, R> = {
	readonly _kind: "mutation";
	readonly _visibility: V;
	readonly _args: A;
	readonly _result: R;
};
export type RegisteredAction<V extends string, A, R> = {
	readonly _kind: "action";
	readonly _visibility: V;
	readonly _args: A;
	readonly _result: R;
};
export type ApiOf<Modules, Visibility extends string> = {
	[M in keyof Modules]: {
		[K in keyof Modules[M] as Modules[M][K] extends { _visibility: Visibility }
			? K
			: never]: Modules[M][K] extends {
			_kind: infer Kind extends string;
			_args: infer A;
			_result: infer R;
		}
			? FunctionReference<Kind, Visibility, A, R>
			: never;
	};
};
export type Range = {
	eq(field: string, value: unknown): Range;
	gte(field: string, value: unknown): Range;
	lt(field: string, value: unknown): Range;
};
export type Query<T extends TableNames> = {
	withIndex(name: string, fn?: (range: Range) => unknown): Query<T>;
	filter(
		fn: (q: {
			field(name: keyof Doc<T>): unknown;
			eq(a: unknown, b: unknown): unknown;
			lte(a: unknown, b: unknown): unknown;
		}) => unknown,
	): Query<T>;
	order(direction: "asc" | "desc"): Query<T>;
	collect(): Promise<Doc<T>[]>;
	first(): Promise<Doc<T> | null>;
	unique(): Promise<Doc<T> | null>;
};
export type Database = {
	get<T extends TableNames>(id: Id<T>): Promise<Doc<T> | null>;
	insert<T extends TableNames>(
		table: T,
		value: InferFields<(typeof schema.tables)[T]["fields"]>,
	): Promise<Id<T>>;
	patch<T extends TableNames>(
		id: Id<T>,
		value: Partial<InferFields<(typeof schema.tables)[T]["fields"]>>,
	): Promise<void>;
	delete<T extends TableNames>(id: Id<T>): Promise<void>;
	query<T extends TableNames>(table: T): Query<T>;
};
export type QueryCtx = { db: Database; currentUser?: AuthUser };
export type MutationCtx = QueryCtx & { scheduler: Scheduler };
export type Scheduler = {
	runAfter<A, R>(
		delay: number,
		ref: FunctionReference<string, string, A, R>,
		args: A,
	): Promise<string>;
};
export type ActionCtx = MutationCtx & {
	runQuery<K extends string, V extends string, A, R>(
		ref: FunctionReference<K, V, A, R>,
		args: A,
	): Promise<R>;
	runMutation<K extends string, V extends string, A, R>(
		ref: FunctionReference<K, V, A, R>,
		args: A,
	): Promise<R>;
	runAction<K extends string, V extends string, A, R>(
		ref: FunctionReference<K, V, A, R>,
		args: A,
	): Promise<R>;
};
export type Builder<K extends string, V extends string, C> = <
	A extends Record<string, Validator<any>>,
	R,
>(definition: {
	args: A;
	handler: (ctx: C, args: InferFields<A>) => R;
}) => {
	readonly _kind: K;
	readonly _visibility: V;
	readonly _args: InferFields<A>;
	readonly _result: Awaited<R>;
};
