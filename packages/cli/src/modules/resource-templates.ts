export type ResourceTemplateName = string;

export type ResourceTemplateCategory = "api" | "db" | "web";

export type ResourceTemplateCloud = "cf";

export type ResourceTemplateCloudService = "d1" | "worker";

export type ResourceTemplateDescriptor = "api" | "db" | "site";

export type ResourceTemplate = {
	name: ResourceTemplateName;
	category: ResourceTemplateCategory;
	cloud: ResourceTemplateCloud;
	cloudService: ResourceTemplateCloudService;
	descriptor: ResourceTemplateDescriptor;
};

export type ResourceTemplates = Record<string, ResourceTemplate>;

const resourceTemplates: ResourceTemplates = {
	"cloudflare-d1": {
		name: "Cloudflare D1",
		category: "db",
		cloud: "cf",
		cloudService: "d1",
		descriptor: "db",
	},
	"cloudflare-worker-hono": {
		name: "Cloudflare Worker + Hono",
		category: "api",
		cloud: "cf",
		cloudService: "worker",
		descriptor: "api",
	},
	"cloudflare-worker-remix": {
		name: "Cloudflare Worker + Remix",
		category: "web",
		cloud: "cf",
		cloudService: "worker",
		descriptor: "site",
	},
};

export const setResourceTemplates = (): ResourceTemplates => resourceTemplates;
