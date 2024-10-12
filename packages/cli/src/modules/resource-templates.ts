// "skip" exists for type safety.
// Users can skip over adding various resources in "gas add"
// input prompts.

export type ResourceTemplateName = string;

export type ResourceTemplateCategory = "api" | "db" | "skip" | "web";

export type ResourceTemplateCloud = "cf" | "skip";

export type ResourceTemplateCloudService = "d1" | "skip" | "worker";

export type ResourceTemplateDescriptor = "api" | "db" | "site" | "skip";

export type ResourceTemplate = {
	name: ResourceTemplateName;
	category: ResourceTemplateCategory;
	cloud: ResourceTemplateCloud;
	cloudService: ResourceTemplateCloudService;
	descriptor: ResourceTemplateDescriptor;
};

export type ResourceTemplateKey =
	| "cloudflare-d1"
	| "cloudflare-worker-hono"
	| "cloudflare-worker-remix"
	| "skip";

export type ResourceTemplates = Record<ResourceTemplateKey, ResourceTemplate>;

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
	skip: {
		name: "Skip",
		category: "skip",
		cloud: "skip",
		cloudService: "skip",
		descriptor: "skip",
	},
};

export const setResourceTemplates = (): ResourceTemplates => resourceTemplates;
