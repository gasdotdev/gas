export type ResourceTemplateCategory = "api" | "db" | "web";

export type ResourceTemplateCloud = "cf";

export type ResourceTemplateCloudService = "pages" | "worker" | "d1";

export type ResourceTemplateDescriptor = "ssr" | "api" | "db";

export type ResourceTemplate = {
	name: string;
	category: ResourceTemplateCategory;
	cloud: ResourceTemplateCloud;
	cloudService: ResourceTemplateCloudService;
	descriptor: ResourceTemplateDescriptor;
};

export type ResourceTemplates = Record<string, ResourceTemplate>;

const resourceTemplates: ResourceTemplates = {
	"cloudflare-pages-remix": {
		name: "Cloudflare Pages + Remix",
		category: "web",
		cloud: "cf",
		cloudService: "pages",
		descriptor: "ssr",
	},
	"cloudflare-worker-hono": {
		name: "Cloudflare Worker + Hono",
		category: "api",
		cloud: "cf",
		cloudService: "worker",
		descriptor: "api",
	},
	"cloudflare-d1": {
		name: "Cloudflare D1",
		category: "db",
		cloud: "cf",
		cloudService: "d1",
		descriptor: "db",
	},
};

export const setResourceTemplates = (): ResourceTemplates => resourceTemplates;
