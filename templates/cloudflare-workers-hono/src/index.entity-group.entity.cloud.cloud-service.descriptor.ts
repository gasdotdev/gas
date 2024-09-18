import { cloudflareWorkerApi } from "@gasdotdev/resources";
import { Hono } from "hono";

export type Env = {};

export const entityGroupEntityCloudCloudServiceDescriptor = cloudflareWorkerApi(
	{
		name: "ENTITY_GROUP_ENTITY_CLOUD_CLOUD_SERVICE_DESCRIPTOR",
	} as const,
);

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.json({ data: "Hello, World!" }));

export default app;
