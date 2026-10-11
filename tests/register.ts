// Node strips TypeScript but needs a resolver for the extensionless imports used by Vite/Convex.
import { registerHooks } from "node:module";

registerHooks({
	resolve(specifier, context, nextResolve) {
		try {
			return nextResolve(specifier, context);
		} catch (error) {
			if (!specifier.startsWith(".")) throw error;
			for (const candidate of [
				specifier.replace(/\.js$/, ".ts"),
				`${specifier}.ts`,
				`${specifier}.tsx`,
				`${specifier}.js`,
			])
				try {
					return nextResolve(candidate, context);
				} catch {
					/* Try the next TypeScript extension. */
				}
			throw error;
		}
	},
});
