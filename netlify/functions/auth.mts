import { backendConfig, proxyAuth } from "../../src/lib/auth";

// JSON authentication API only. Astro builds every HTML page ahead of time.
export default async (request: Request) => {
	const config = backendConfig();
	if (!config)
		return Response.json(
			{ message: "Authentication is not configured." },
			{ status: 503 },
		);
	try {
		return await proxyAuth(request, config);
	} catch {
		return Response.json(
			{ message: "Authentication is temporarily unavailable." },
			{ status: 502 },
		);
	}
};
export const config = { path: "/api/auth/*", preferStatic: false };
