import type {
	FunctionArgs,
	FunctionReference,
	FunctionReturnType,
} from "../../server/contracts";
import { routes } from "../shared/routes";
export async function request(path: string, method = "GET", args?: unknown) {
	const response = await fetch(path, {
		method,
		credentials: "same-origin",
		headers: args === undefined ? {} : { "Content-Type": "application/json" },
		body: args === undefined ? undefined : JSON.stringify(args),
	});
	const result = await response.json();
	if (!response.ok)
		throw new Error(result.error ?? "The request failed. Try again.");
	return result;
}
export const makeFunctionReference = <_T extends string>(name: string) =>
	name as unknown as FunctionReference<any>;
export class RestClient {
	async query<Q extends FunctionReference<any>>(
		ref: Q,
		args: FunctionArgs<Q>,
	): Promise<FunctionReturnType<Q>> {
		return this.call(ref, args);
	}
	async mutation<Q extends FunctionReference<any>>(
		ref: Q,
		args: FunctionArgs<Q>,
	): Promise<FunctionReturnType<Q>> {
		return this.call(ref, args);
	}
	async action<Q extends FunctionReference<any>>(
		ref: Q,
		args: FunctionArgs<Q>,
	): Promise<FunctionReturnType<Q>> {
		return this.call(ref, args);
	}
	private async call(ref: unknown, args: unknown) {
		const route = routes[String(ref)];
		if (!route) throw new Error("Unknown API operation.");
		const [method, path] = route;
		return method === "GET"
			? request(
					`${path}?${new URLSearchParams(Object.entries(args as object).map(([k, v]) => [k, String(v)]))}`,
				)
			: request(path, method, args);
	}
	onUpdate(
		ref: any,
		args: any,
		update: (data: any) => void,
		error: () => void,
	) {
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				const value = await this.query(ref, args);
				if (!stopped) update(value);
			} catch {
				if (!stopped) error();
			} finally {
				if (!stopped) timer = setTimeout(poll, 2000);
			}
		};
		timer = setTimeout(poll, 2000);
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	}
	async close() {}
}
