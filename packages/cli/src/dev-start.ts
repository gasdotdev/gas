import { Miniflare } from "miniflare";

export async function devStart() {
	const mfPort = 3000;

	const mf = new Miniflare({
		modules: true,
		scriptPath: "./gas/core-base-api/build/src/index.core.base.api.js",
		port: mfPort,
	});

	const res = await mf.dispatchFetch("http://localhost:3000");
	console.log(await res.text());

	/*
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
	*/
}
