import { once } from 'node:events';
import type { IncomingHttpHeaders, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { createReadableStreamFromReadable } from '@remix-run/node';
import { createRequestHandler } from '@remix-run/server-runtime';
import type { ServerBuild } from '@remix-run/server-runtime';
import { hc } from 'hono/client';
import { splitCookiesString } from 'set-cookie-parser';
import type { Plugin } from 'vite';
import type * as Vite from 'vite';
import type { ApiType } from '../../cli/src/cmds/dev-start.js';

/**
   * The following code is sourced from:
   * https://github.com/remix-run/remix/blob/7c0366fc73e513f55fe643291d1b5669d62ad13d/packages/remix-dev/vite/cloudflare-proxy-plugin.ts
   * 
   * MIT License
   * 
   * Copyright (c) Remix Software Inc. 2020-2021
   * Copyright (c) Shopify Inc. 2022-2024
  
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
   */

const serverBuildId = 'virtual:remix/server-build';

const NAME = 'vite-plugin-cloudflare-remix-dev';

export const cloudflareRemixDevPlugin = <Env>(
	devServerPort: number,
	viteServerPort: number,
): Plugin => {
	return {
		name: NAME,
		config: () => ({
			ssr: {
				resolve: {
					externalConditions: ['workerd', 'worker'],
				},
			},
		}),
		configResolved: (viteConfig) => {
			const pluginIndex = (name: string) =>
				viteConfig.plugins.findIndex((plugin) => plugin.name === name);
			const remixIndex = pluginIndex('remix');
			if (remixIndex >= 0 && remixIndex < pluginIndex(NAME)) {
				throw new Error(
					`The "${NAME}" plugin should be placed before the Remix plugin in your Vite config file`,
				);
			}
		},
		configureServer: async (viteDevServer) => {
			//let { getPlatformProxy } = await importWrangler();

			// Do not include `dispose` in Cloudflare context
			//let { dispose, ...cloudflare } = await getPlatformProxy<Env, Cf>(options);

			// let context = { cloudflare };
			/*
    cloudflare: {
          env: Env;
          cf: Cf;
          ctx: ExecutionContext;
          caches: CacheStorage_2;
      };
        */

			const client = hc<ApiType>(`http://localhost:${devServerPort}`);

			class ServiceFetcher {
				private resourceName: string;

				constructor(resourceName: string) {
					this.resourceName = resourceName;
				}

				async fetch(request: any) {
					const res = await client['miniflare-run'].$post({
						json: {
							action: 'fetch',
							resourceName: this.resourceName,
							fetchParams: {},
						},
					});
					return res;
				}
			}

			async function setEnv() {
				const env = {};

				const res = await client['dev-manifest'].$get();

				if (res.ok) {
					const data = await res.json();

					const viteBasedResourceName =
						data.devManifest.portToViteBasedResourceName[viteServerPort];

					const viteBasedResourceDependencies =
						data.devManifest.resources.nameToDependencies[
							viteBasedResourceName
						];

					for (const dependencyName of viteBasedResourceDependencies) {
						if (
							data.devManifest.resources.nameToConfigAst[dependencyName]
								.function === 'cloudflareWorkerApi'
						) {
							const serviceFetcher = new ServiceFetcher(dependencyName);
							// @ts-expect-error
							env[dependencyName] = serviceFetcher;
						}
					}
				} else {
					console.error(res.status, res.statusText);
				}

				return env;
			}

			let env = undefined;

			if (process.env.NODE_ENV === 'development') {
				env = await setEnv();
			}

			const context = {
				cloudflare: {
					env: {
						...env,
					},
					cf: undefined,
					ctx: undefined,
					caches: undefined,
				},
			} as any;

			return () => {
				if (!viteDevServer.config.server.middlewareMode) {
					viteDevServer.middlewares.use(async (nodeReq, nodeRes, next) => {
						try {
							const build = (await viteDevServer.ssrLoadModule(
								serverBuildId,
							)) as ServerBuild;

							const handler = createRequestHandler(build, 'development');
							const req = fromNodeRequest(nodeReq);
							const res = await handler(req, context);
							await toNodeRequest(res, nodeRes);
						} catch (error) {
							next(error);
						}
					});
				}
			};
		},
	};
};

/**
 * The following code is sourced from:
 * https://github.com/remix-run/remix/blob/7c0366fc73e513f55fe643291d1b5669d62ad13d/packages/remix-dev/vite/node-adapter.ts
 *
 * MIT License
 *
 * Copyright (c) Remix Software Inc. 2020-2021
 * Copyright (c) Shopify Inc. 2022-2024
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export type NodeRequestHandler = (
	req: Vite.Connect.IncomingMessage,
	res: ServerResponse,
) => Promise<void>;

function fromNodeHeaders(nodeHeaders: IncomingHttpHeaders): Headers {
	const headers = new Headers();

	for (const [key, values] of Object.entries(nodeHeaders)) {
		if (values) {
			if (Array.isArray(values)) {
				for (const value of values) {
					headers.append(key, value);
				}
			} else {
				headers.set(key, values);
			}
		}
	}

	return headers;
}

// Based on `createRemixRequest` in packages/remix-express/server.ts
export function fromNodeRequest(
	nodeReq: Vite.Connect.IncomingMessage,
): Request {
	const origin =
		nodeReq.headers.origin && 'null' !== nodeReq.headers.origin
			? nodeReq.headers.origin
			: `http://${nodeReq.headers.host}`;
	// Use `req.originalUrl` so Remix is aware of the full path
	invariant(
		nodeReq.originalUrl,
		'Expected `nodeReq.originalUrl` to be defined',
	);
	const url = new URL(nodeReq.originalUrl, origin);
	const init: RequestInit = {
		method: nodeReq.method,
		headers: fromNodeHeaders(nodeReq.headers),
	};

	if (nodeReq.method !== 'GET' && nodeReq.method !== 'HEAD') {
		init.body = createReadableStreamFromReadable(nodeReq);
		(init as { duplex: 'half' }).duplex = 'half';
	}

	return new Request(url.href, init);
}

// Adapted from solid-start's `handleNodeResponse`:
// https://github.com/solidjs/solid-start/blob/7398163869b489cce503c167e284891cf51a6613/packages/start/node/fetch.js#L162-L185
export async function toNodeRequest(res: Response, nodeRes: ServerResponse) {
	nodeRes.statusCode = res.status;
	nodeRes.statusMessage = res.statusText;

	const cookiesStrings = [];

	for (const [name, value] of res.headers) {
		if (name === 'set-cookie') {
			cookiesStrings.push(...splitCookiesString(value));
		} else nodeRes.setHeader(name, value);
	}

	if (cookiesStrings.length) {
		nodeRes.setHeader('set-cookie', cookiesStrings);
	}

	if (res.body) {
		// https://github.com/microsoft/TypeScript/issues/29867
		const responseBody = res.body as unknown as AsyncIterable<Uint8Array>;
		const readable = Readable.from(responseBody);
		readable.pipe(nodeRes);
		await once(readable, 'end');
	} else {
		nodeRes.end();
	}
}

/**
 * The following code is sourced from:
 * https://github.com/remix-run/remix/blob/7c0366fc73e513f55fe643291d1b5669d62ad13d/packages/remix-dev/invariant.ts
 *
 * MIT License
 *
 * Copyright (c) Remix Software Inc. 2020-2021
 * Copyright (c) Shopify Inc. 2022-2024
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export function invariant(value: boolean, message?: string): asserts value;

export function invariant<T>(
	value: T | null | undefined,
	message?: string,
): asserts value is T;

export function invariant(value: any, message?: string) {
	if (value === false || value === null || typeof value === 'undefined') {
		console.error(
			'The following error is a bug in Remix; please open an issue! https://github.com/remix-run/remix/issues/new',
		);
		throw new Error(message);
	}
}
