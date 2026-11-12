import { request } from "./rest-client";

const auth = async (path: string, args?: unknown) => {
	try {
		return {
			data: await request(
				`/api/auth/${path}`,
				args === undefined ? "GET" : "POST",
				args,
			),
			error: null,
		};
	} catch (error) {
		return {
			data: null,
			error: {
				message: error instanceof Error ? error.message : "Please try again.",
			},
		};
	}
};
export const authClient = {
	getSession: () => auth("session"),
	signIn: { email: (args: object) => auth("login", args) },
	signUp: { email: (args: object) => auth("register", args) },
	signOut: () => auth("logout", {}),
	requestPasswordReset: (args: object) => auth("request-password-reset", args),
	resetPassword: (args: object) => auth("reset-password", args),
	changePassword: (args: object) => auth("change-password", args),
	updateUser: (args: object) => auth("update-user", args),
};
