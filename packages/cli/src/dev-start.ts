import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { Miniflare } from "miniflare";
import { z } from "zod";

let mf: Miniflare;
let mfPort: number;

const api = new Hono();

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
		// ...
		return c.json(
			{
				ok: true,
				message: "Created!",
			},
			201,
		);
	},
);

export type ApiType = typeof route;

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
api.all("*", async (c) => {
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

	const mfPort = devSetupData.miniflarePort;

	const workers = [];
	for (const name in devSetupData.nameToConfigData) {
		if (
			devSetupData.nameToConfigData[name].functionName === "cloudflareWorkerApi"
		) {
			workers.push({
				name,
				modules: true,
				scriptPath: devSetupData.nameToBuildIndexFilePath[name],
			});
		}
	}

	mf = new Miniflare({
		port: mfPort,
		workers,
	});

	serve(
		{
			fetch: api.fetch,
			port: devSetupData.devServerPort,
		},
		() => {
			console.log(`Server is running on port ${devSetupData.devServerPort}`);
		},
	);
}
