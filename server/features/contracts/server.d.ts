import type {
	Builder,
	QueryCtx,
	MutationCtx,
	ActionCtx,
} from "../../contracts";
export type { QueryCtx, MutationCtx, ActionCtx } from "../../contracts";
export declare const query: Builder<"query", "public", QueryCtx>;
export declare const mutation: Builder<"mutation", "public", MutationCtx>;
export declare const action: Builder<"action", "public", ActionCtx>;
export declare const internalQuery: Builder<"query", "internal", QueryCtx>;
export declare const internalMutation: Builder<
	"mutation",
	"internal",
	MutationCtx
>;
export declare const internalAction: Builder<"action", "internal", ActionCtx>;
