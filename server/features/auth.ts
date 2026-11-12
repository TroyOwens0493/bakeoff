import type { QueryCtx } from "./contracts/server";
export type AuthUser = { _id: string; id: string; name: string; email: string };
export const authComponent = {
	async getAuthUser(ctx: QueryCtx): Promise<AuthUser> {
		const user = (ctx as unknown as { currentUser?: AuthUser }).currentUser;
		if (!user) throw new Error("Sign in to continue.");
		return user;
	},
};
