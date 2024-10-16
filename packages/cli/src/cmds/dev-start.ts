import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { Miniflare } from "miniflare";
import { z } from "zod";
import type { Resources } from "../modules/resources.js";
import type { DevManifest } from "./dev-setup.js";

let mf: Miniflare;
let mfPort: number;

let resources: Resources;

let devManifest: DevManifest;

const devManifestApi = new Hono().get("/", (c) => {
	return c.json({
		devManifest,
	});
});

const ASchema = z.object({ action: z.literal("a"), a: z.string() });
const BSchema = z.object({ action: z.literal("b"), b: z.string() });
const ABSchema = z.union([ASchema, BSchema]);

const miniflareApi = new Hono().post(
	"/",
	zValidator(
		"json",
		z.object({
			action: z.literal("fetch"),
			resourceName: z.string(),
			fetchParams: z.object({}),
		}),
	),
	async (c) => {
		const { resourceName } = c.req.valid("json");
		const worker = await mf.getWorker(resourceName);
		const res = await worker.fetch(`https://localhost:${mfPort}`);
		// Proxy:
		// https://github.com/honojs/hono/issues/1491
		// https://github.com/honojs/node-server/issues/121
		// There's a type error surpressed below with @ts-ignore.
		// Not sure if the setup becomes a problem with more complicated responses,
		// but it's working for now. If it does become a problem, look into the above
		// links and/or maybe something like the following:
		// const res = await mf.dispatchFetch(`http://localhost:${mfPort}`);
		// const newResponse = new Response(res.body, {
		// 	status: res.status,
		// 	statusText: res.statusText,
		// 	headers: Object.fromEntries(res.headers.entries()),
		// });
		// return newResponse;
		// @ts-ignore
		const newResponse = new Response(res.body, res);
		return newResponse;
	},
);

const api = new Hono();

const routes = api
	.route("/dev-manifest", devManifestApi)
	.route("/miniflare-run", miniflareApi);

export type ApiType = typeof routes;

routes.all("*", async (c) => {
	const res = await mf.dispatchFetch(`https://localhost:${mfPort}`);
	const worker = await mf.getWorker("CORE_BASE_API");
	// @ts-ignore
	const newResponse = new Response(res.body, res);
	return newResponse;
});

export async function runDevStart() {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	const devManifestJsonPath = join(__dirname, "..", "..", ".dev-manifest.json");

	devManifest = JSON.parse(
		await fs.readFile(devManifestJsonPath, "utf-8"),
	) as DevManifest;

	resources = devManifest.resources;

	mfPort = devManifest.miniflarePort;

	const workers = [];
	for (const name in devManifest.resources.nameToConfigAst) {
		if (
			devManifest.resources.nameToConfigAst[name].function ===
			"cloudflareWorkerApi"
		) {
			workers.push({
				name,
				modules: true,
				scriptPath: devManifest.resources.nameToFiles[name].buildPath,
			});
		}
	}

	if (workers.length > 0) {
		mf = new Miniflare({
			port: mfPort,
			workers,
		});
	}

	serve(
		{
			fetch: routes.fetch,
			port: devManifest.devServerPort,
		},
		() => {
			console.log(`Server is running on port ${devManifest.devServerPort}`);
		},
	);
}
