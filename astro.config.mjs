import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { loadEnv } from "vite";
import { devAuthProxy } from "./server/dev-auth";

const env = loadEnv(
	process.env.NODE_ENV === "production" ? "production" : "development",
	process.cwd(),
	"",
);
export default defineConfig({
	output: "static",
	server: { port: 3000 },
	vite: {
		plugins: [tailwindcss(), devAuthProxy(env)],
		server: { strictPort: true },
		envPrefix: ["PUBLIC_", "VITE_"],
	},
});
