type ResourceTemplateType = "api" | "db" | "web";

type ResourceTemplateItem = {
	name: string;
	type: ResourceTemplateType;
	cloud: string;
	cloudService: string;
	descriptor: string;
};

type ResourceTemplates = Record<string, ResourceTemplateItem>;

export function setResourceTemplates(): ResourceTemplates {
	return {
		"cloudflare-pages-remix": {
			name: "Cloudflare Pages + Remix",
			type: "web",
			cloud: "cloudflare",
			cloudService: "pages",
			descriptor: "ssr",
		},
		"cloudflare-workers-hono": {
			name: "Cloudflare Workers + Hono",
			type: "api",
			cloud: "cloudflare",
			cloudService: "workers",
			descriptor: "api",
		},
		"cloudflare-d1": {
			name: "Cloudflare D1",
			type: "db",
			cloud: "cloudflare",
			cloudService: "d1",
			descriptor: "db",
		},
	};
}

export type ResourceTemplatesSelectPromptListItems = {
	name: string;
	value: string;
}[];

export function getResourceTemplateSelectPromptListItems(
	record: ResourceTemplates,
	types?: ResourceTemplateType[],
): ResourceTemplatesSelectPromptListItems {
	if (types === undefined) {
		return Object.entries(record).map(([key, value]) => ({
			name: value.name,
			value: key,
		}));
	}
	return Object.entries(record)
		.filter(([_, value]) => types.includes(value.type))
		.map(([key, value]) => ({
			name: value.name,
			value: key,
		}));
}
