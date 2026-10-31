import netlify from "@astrojs/netlify";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { loadEnv } from "vite";

const env = loadEnv(
	process.env.NODE_ENV === "production" ? "production" : "development",
	process.cwd(),
	"",
);
const site =
	env.SITE_URL ||
	(process.env.NETLIFY === "true"
		? (process.env.DEPLOY_PRIME_URL ?? process.env.URL)
		: undefined);
const origins = [site, ...(env.APP_ALLOWED_ORIGINS ?? "").split(",")]
	.filter(Boolean)
	.map((value) => new URL(value.trim()));

export default defineConfig({
	site,
	security: {
		allowedDomains: [
			{ hostname: "localhost" },
			{ hostname: "127.0.0.1" },
			{ hostname: "[::1]" },
			...origins.map((url) => ({
				protocol: url.protocol.slice(0, -1),
				hostname: url.hostname,
				port: url.port || (url.protocol === "https:" ? "443" : "80"),
			})),
		],
	},
	output: "server",
	adapter:
		process.env.NETLIFY === "true" ? netlify() : node({ mode: "standalone" }),
	server: { port: 3000 },
	vite: { plugins: [tailwindcss()], server: { strictPort: true } },
});
