type ResourceTemplateType = "api" | "db" | "web";

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

export type ResourceTemplatesSelectPromptListItems = {
	name: string;
	value: string;
}[];

export const setResourceTemplateSelectPromptListItems = (
	record: ResourceTemplates,
	types?: ResourceTemplateType[],
): ResourceTemplatesSelectPromptListItems => {
	const entries = Object.entries(record);
	return types
		? entries
				.filter(([_, value]) => types.includes(value.type))
				.map(([key, value]) => ({ name: value.name, value: key }))
		: entries.map(([key, value]) => ({ name: value.name, value: key }));
};
