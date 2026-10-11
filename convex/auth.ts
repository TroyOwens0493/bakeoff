import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
export const authComponent = createClient<DataModel>(components.betterAuth);
export const createAuth = (ctx: GenericCtx<DataModel>) =>
	betterAuth({
		baseURL: process.env.SITE_URL,
		secret: process.env.BETTER_AUTH_SECRET,
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 12,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url, token }) => {
				if (!("scheduler" in ctx))
					throw new Error("Password reset requires a mutation context.");
				await ctx.scheduler.runAfter(0, internal.email.reset, {
					to: user.email,
					url,
					key: `reset-${token}`,
				});
			},
		},
		plugins: [convex({ authConfig })],
	});
export const getCurrentUser = query({
	args: {},
	handler: (ctx) => authComponent.safeGetAuthUser(ctx),
});
