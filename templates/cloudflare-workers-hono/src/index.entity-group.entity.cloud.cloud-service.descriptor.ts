import { cloudflareWorkerApi } from "@gasdotdev/resources";
import { Hono } from "hono";

export type Env = {};

export const entityGroupEntityDescriptor = cloudflareWorkerApi({
	name: "ENTITY_GROUP_ENTITY_DESCRIPTOR",
} as const);

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.json({ data: "Hello, World!" }));

export default app;
