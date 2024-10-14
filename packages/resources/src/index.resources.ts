import type { D1Database, Fetcher, Rpc } from "@cloudflare/workers-types";

export type D1Bindings<T extends ReadonlyArray<{ readonly binding: string }>> =
	{
		[P in T[number]["binding"]]: D1Database;
	};

export type ServiceRpcBindings<
	TBindings extends ReadonlyArray<{ readonly binding: string }>,
	TRpc extends Rpc.WorkerEntrypointBranded | undefined = undefined,
> = {
	[P in TBindings[number]["binding"]]: TRpc;
};

export type ServiceFetcherBindings<
	T extends ReadonlyArray<{ readonly binding: string }>,
> = {
	[P in T[number]["binding"]]: Fetcher;
};

export type CloudflareD1 = {
	name: string;
};

export function cloudflareD1<T extends CloudflareD1>(resource: T): T {
	return resource;
}

export type CloudflareWorker = {
	name: string;
	db?: Array<{
		binding: string;
	}>;
};

export function cloudflareWorker<T extends CloudflareWorker>(resource: T): T {
	return resource;
}

export function cloudflareWorkerApi<T extends CloudflareWorker>(
	resource: T,
): T {
	return resource;
}

export function cloudflareWorkerSite<T extends CloudflareWorker>(
	resource: T,
): T {
	return resource;
}
