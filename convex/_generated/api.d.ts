/* Local API types. Regenerate with convex codegen after development login. */
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as auth from "../auth.js";
import type * as email from "../email.js";
import type * as todos from "../todos.js";
import type * as budgets from "../budgets.js";
import type * as accounts from "../accounts.js";
import type * as bank from "../bank.js";
import type * as sharing from "../sharing.js";
import type * as contributions from "../contributions.js";
import type { ComponentApi } from "@convex-dev/better-auth/_generated/component.js";
declare const fullApi: ApiFromModules<{auth: typeof auth,email: typeof email,todos: typeof todos,budgets: typeof budgets,accounts: typeof accounts,bank: typeof bank,sharing: typeof sharing,contributions: typeof contributions}>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
export declare const components: { betterAuth: ComponentApi<"betterAuth"> };
