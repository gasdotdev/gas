import { cloudflareWorkerApi } from "@gasdotdev/resources";
import { Hono } from "hono";

export const entityGroupEntityCloudCloudServiceDescriptor = cloudflareWorkerApi(
	{
		name: "ENTITY_GROUP_ENTITY_CLOUD_CLOUD_SERVICE_DESCRIPTOR",
	} as const,
);

type Env = {};

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.json({ data: "Hello, World!" }));

export default app;
