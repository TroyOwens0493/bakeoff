import { execFileSync, spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { extname, join } from "node:path";
import { gzipSync } from "node:zlib";

const started = performance.now();
const result = spawnSync("pnpm", ["build"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
const buildMs = Math.round(performance.now() - started);
async function files(dir) {
	const values = [];
	for (const item of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, item.name);
		values.push(...(item.isDirectory() ? await files(path) : [path]));
	}
	return values;
}
const outputs = await files("dist");
const byType = {};
for (const path of outputs) {
	const body = await readFile(path);
	const type = extname(path) || "other";
	byType[type] ??= { files: 0, bytes: 0, gzipBytes: 0 };
	byType[type].files++;
	byType[type].bytes += body.length;
	byType[type].gzipBytes += gzipSync(body).length;
}
const data = {
	measuredAt: new Date().toISOString(),
	architecture: "Astro static HTML with Convex browser data",
	node: process.version,
	platform: `${platform()}-${arch()}`,
	commit: execFileSync("git", ["rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim(),
	workingTreeDirty: Boolean(
		execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
	),
	buildMs,
	outputs: byType,
	notes:
		"One local warm-build sample. Gzip sizes are per-file estimates, not observed network transfer. This is not a Lighthouse score or a controlled comparison with the first bakeoff.",
};
await writeFile(
	"docs/BUILD_MEASUREMENT.json",
	JSON.stringify(data, null, 2) + "\n",
);
console.log(JSON.stringify(data, null, 2));
