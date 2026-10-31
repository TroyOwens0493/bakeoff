import type { APIRoute } from "astro";
import { backendConfig, proxyAuth } from "../../../lib/auth";

const handle: APIRoute = async ({ request }) => {
	const config = backendConfig();
	if (!config)
		return Response.json(
			{ message: "Authentication is not configured." },
			{ status: 503, headers: { "Cache-Control": "private, no-store" } },
		);
	try {
		return await proxyAuth(request, config);
	} catch {
		return Response.json(
			{ message: "Authentication is temporarily unavailable." },
			{ status: 502, headers: { "Cache-Control": "private, no-store" } },
		);
	}
};
export const GET = handle;
export const POST = handle;
