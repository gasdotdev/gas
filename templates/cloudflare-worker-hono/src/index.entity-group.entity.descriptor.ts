import { cloudflareWorkerApi } from "@gasdotdev/resources";

export type Env = {};

export const entityGroupEntityDescriptor = cloudflareWorkerApi({
	name: "ENTITY_GROUP_ENTITY_DESCRIPTOR",
} as const);
