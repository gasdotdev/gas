export type ResourceTemplateType = "api" | "db" | "web";

export type ResourceTemplate = {
	name: string;
	type: ResourceTemplateType;
	cloud: string;
	cloudService: string;
	descriptor: string;
};

export type ResourceTemplates = Record<string, ResourceTemplate>;

const resourceTemplates: ResourceTemplates = {
	"cloudflare-pages-remix": {
		name: "Cloudflare Pages + Remix",
		type: "web",
		cloud: "cf",
		cloudService: "pages",
		descriptor: "ssr",
	},
	"cloudflare-workers-hono": {
		name: "Cloudflare Workers + Hono",
		type: "api",
		cloud: "cf",
		cloudService: "workers",
		descriptor: "api",
	},
	"cloudflare-d1": {
		name: "Cloudflare D1",
		type: "db",
		cloud: "cf",
		cloudService: "d1",
		descriptor: "db",
	},
};

export const setResourceTemplates = (): ResourceTemplates => resourceTemplates;
