import http from "node:http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { Miniflare } from "miniflare";
import { Config } from "./config.js";
import { Resources } from "./resources.js";
async function findAvailablePort(startPort: number): Promise<number> {
	let port = startPort;
	let isAvailable = false;

	while (!isAvailable) {
		try {
			await new Promise((resolve, reject) => {
				const testServer = http
					.createServer()
					.once("error", (err: NodeJS.ErrnoException) => {
						if (err.code === "EADDRINUSE") {
							resolve(false);
						} else {
							reject(err);
						}
					})
					.once("listening", () => {
						testServer.close(() => {
							isAvailable = true;
							resolve(true);
						});
					})
					.listen(port);
			});
		} catch (error) {
			throw new Error(
				`An error occurred while checking port availability: ${error}`,
			);
		}

		if (!isAvailable) {
			port++;
		}
	}

	return port;
}

export async function devStart() {
	const config = await Config.new();

	const resources = await Resources.new(config.containerDirPath);

	const api = new Hono();

	const honoPort = await findAvailablePort(8787);
	const mfPort = await findAvailablePort(honoPort + 1);

	const mf = new Miniflare({
		modules: true,
		script: `
        export default {
          async fetch(request, env, ctx) {
            return new Response("Hello Miniflare!");
          }
        }
        `,
		port: mfPort,
	});

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
		// @ts-ignore
		const newResponse = new Response(res.body, res);
		return newResponse;
	});

	serve(
		{
			fetch: api.fetch,
			port: honoPort,
		},
		() => {
			console.log(`Server is running on port ${honoPort}`);
		},
	);
}
