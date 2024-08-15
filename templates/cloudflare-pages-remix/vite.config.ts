import {
  vitePlugin as remix,
} from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { createRequestHandler } from "@remix-run/server-runtime";
import {
type AppLoadContext,
type ServerBuild,
} from "@remix-run/server-runtime";
import { type Plugin } from "vite";
import { type GetPlatformProxyOptions, type PlatformProxy } from "wrangler";
import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import { splitCookiesString } from "set-cookie-parser";
import { createReadableStreamFromReadable } from "@remix-run/node";
import type * as Vite from "vite";

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

let serverBuildId = "virtual:remix/server-build";

type CfProperties = Record<string, unknown>;

type LoadContext<Env, Cf extends CfProperties> = {
cloudflare: Omit<PlatformProxy<Env, Cf>, "dispose">;
};

type GetLoadContext<Env, Cf extends CfProperties> = (args: {
request: Request;
context: LoadContext<Env, Cf>;
}) => AppLoadContext | Promise<AppLoadContext>;

function importWrangler() {
try {
  return import("wrangler");
} catch (_) {
  throw Error("Could not import `wrangler`. Do you have it installed?");
}
}

const NAME = "vite-plugin-remix-cloudflare-proxy";

export const cloudflareDevProxyVitePlugin = <Env, Cf extends CfProperties>({
getLoadContext,
...options
}: {
getLoadContext?: GetLoadContext<Env, Cf>;
} & GetPlatformProxyOptions = {}): Plugin => {
return {
  name: NAME,
  config: () => ({
    ssr: {
      resolve: {
        externalConditions: ["workerd", "worker"],
      },
    },
  }),
  configResolved: (viteConfig) => {
    let pluginIndex = (name: string) =>
      viteConfig.plugins.findIndex((plugin) => plugin.name === name);
    let remixIndex = pluginIndex("remix");
    if (remixIndex >= 0 && remixIndex < pluginIndex(NAME)) {
      throw new Error(
        `The "${NAME}" plugin should be placed before the Remix plugin in your Vite config file`
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

    let context = {
      cloudflare: {
        env: {
          TEST: "123",
        },
        cf: undefined,
        ctx: undefined,
        caches: undefined,
      }
    } as any

    return () => {
      if (!viteDevServer.config.server.middlewareMode) {
        viteDevServer.middlewares.use(async (nodeReq, nodeRes, next) => {
          try {
            let build = (await viteDevServer.ssrLoadModule(
              serverBuildId
            )) as ServerBuild;

            let handler = createRequestHandler(build, "development");
            let req = fromNodeRequest(nodeReq);
            let loadContext = getLoadContext
              ? await getLoadContext({ request: req, context })
              : context;
            let res = await handler(req, loadContext);
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
res: ServerResponse
) => Promise<void>;

function fromNodeHeaders(nodeHeaders: IncomingHttpHeaders): Headers {
let headers = new Headers();

for (let [key, values] of Object.entries(nodeHeaders)) {
  if (values) {
    if (Array.isArray(values)) {
      for (let value of values) {
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
nodeReq: Vite.Connect.IncomingMessage
): Request {
let origin =
  nodeReq.headers.origin && "null" !== nodeReq.headers.origin
    ? nodeReq.headers.origin
    : `http://${nodeReq.headers.host}`;
// Use `req.originalUrl` so Remix is aware of the full path
invariant(
  nodeReq.originalUrl,
  "Expected `nodeReq.originalUrl` to be defined"
);
let url = new URL(nodeReq.originalUrl, origin);
let init: RequestInit = {
  method: nodeReq.method,
  headers: fromNodeHeaders(nodeReq.headers),
};

if (nodeReq.method !== "GET" && nodeReq.method !== "HEAD") {
  init.body = createReadableStreamFromReadable(nodeReq);
  (init as { duplex: "half" }).duplex = "half";
}

return new Request(url.href, init);
}

// Adapted from solid-start's `handleNodeResponse`:
// https://github.com/solidjs/solid-start/blob/7398163869b489cce503c167e284891cf51a6613/packages/start/node/fetch.js#L162-L185
export async function toNodeRequest(res: Response, nodeRes: ServerResponse) {
nodeRes.statusCode = res.status;
nodeRes.statusMessage = res.statusText;

let cookiesStrings = [];

for (let [name, value] of res.headers) {
  if (name === "set-cookie") {
    cookiesStrings.push(...splitCookiesString(value));
  } else nodeRes.setHeader(name, value);
}

if (cookiesStrings.length) {
  nodeRes.setHeader("set-cookie", cookiesStrings);
}

if (res.body) {
  // https://github.com/microsoft/TypeScript/issues/29867
  let responseBody = res.body as unknown as AsyncIterable<Uint8Array>;
  let readable = Readable.from(responseBody);
  readable.pipe(nodeRes);
  await once(readable, "end");
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

export function invariant(
value: boolean,
message?: string
): asserts value;

export function invariant<T>(
value: T | null | undefined,
message?: string
): asserts value is T;

export function invariant(value: any, message?: string) {
if (value === false || value === null || typeof value === "undefined") {
  console.error(
    "The following error is a bug in Remix; please open an issue! https://github.com/remix-run/remix/issues/new"
  );
  throw new Error(message);
}
}

// vite config

export default defineConfig({
  plugins: [
    cloudflareDevProxyVitePlugin(),
    remix({
      appDirectory: 'src/app',
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tsconfigPaths(),
  ],
});
