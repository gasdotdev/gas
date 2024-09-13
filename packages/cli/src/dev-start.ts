import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { Miniflare } from "miniflare";
import { z } from "zod";
import { Resources } from "./resources.js";

let mf: Miniflare;
let mfPort: number;

let resources: Resources;

const resourcesApi = new Hono().get("/:name", (c) => {
	const name = c.req.param("name");
	const deps = resources.nameToDeps[name] || [];

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const depToConfigData: Record<string, any> = {};

	for (const dep of deps) {
		if (resources.nameToConfigData[dep]) {
			depToConfigData[dep] = resources.nameToConfigData[dep];
		}
	}

	return c.json({
		name,
		depToConfigData,
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
			binding: z.string(),
			fetchParams: z.object({
				url: z.string(),
			}),
		}),
	),
	async (c) => {
		const worker = await mf.getWorker("CORE_BASE_API");
		const res = await worker.fetch(`https://localhost:${mfPort}`);
		// @ts-ignore
		const newResponse = new Response(res.body, res);
		return newResponse;
	},
);

const api = new Hono();

const routes = api
	.route("/resources", resourcesApi)
	.route("/miniflare-run", miniflareApi);

export type ApiType = typeof routes;

/*
const route = api.post(
	"/posts",
	zValidator(
		"form",
		z.object({
			title: z.string(),
			body: z.string(),
		}),
	),
	(c) => {
		return c.json(
			{
				ok: true,
				message: "Created!",
			},
			201,
		);
	},
);
*/

/*
const schema = z.object({
	name: z.string(),
	age: z.number(),
});

api.post("/author", zValidator("json", schema), (c) => {
	const data = c.req.valid("json");
	return c.json({
		success: true,
		message: `${data.name} is ${data.age}`,
	});
});
*/

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
routes.all("*", async (c) => {
	const res = await mf.dispatchFetch(`https://localhost:${mfPort}`);
	const worker = await mf.getWorker("CORE_BASE_API");
	// @ts-ignore
	const newResponse = new Response(res.body, res);
	return newResponse;
});

export async function devStart() {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	const devSetupJsonPath = join(__dirname, "..", "..", ".dev-setup.json");

	const devSetupData = JSON.parse(await fs.readFile(devSetupJsonPath, "utf-8"));

	resources = Resources.newFromMemory(devSetupData.resources);

	mfPort = devSetupData.miniflarePort;

	const workers = [];
	for (const name in devSetupData.resources.nameToConfigData) {
		if (
			devSetupData.resources.nameToConfigData[name].functionName ===
			"cloudflareWorkerApi"
		) {
			workers.push({
				name,
				modules: true,
				scriptPath: devSetupData.resources.nameToBuildIndexFilePath[name],
			});
		}
	}

	mf = new Miniflare({
		port: mfPort,
		workers,
	});

	serve(
		{
			fetch: routes.fetch,
			port: devSetupData.devServerPort,
		},
		() => {
			console.log(`Server is running on port ${devSetupData.devServerPort}`);
		},
	);
}
