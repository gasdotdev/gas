type ResourceTemplateType = "api" | "db" | "web";

type ResourceTemplateItem = {
	name: string;
	type: ResourceTemplateType;
	descriptor: string;
};

type ResourceTemplatesMap = Map<string, ResourceTemplateItem>;

export type ResourceTemplatesSelectPromptListItems = {
	name: string;
	value: string;
}[];

export class ResourceTemplates {
	public map: ResourceTemplatesMap = new Map();

	public static new(): ResourceTemplates {
		const resourceTemplates = new ResourceTemplates();
		resourceTemplates.setMap();
		return resourceTemplates;
	}

	private setMap(): void {
		this.map.set("cloudflare-pages-remix", {
			name: "Cloudflare Pages + Remix",
			type: "web",
			descriptor: "pages",
		});

		this.map.set("cloudflare-workers-hono", {
			name: "Cloudflare Workers + Hono",
			type: "api",
			descriptor: "api",
		});

		this.map.set("cloudflare-d1", {
			name: "Cloudflare D1",
			type: "db",
			descriptor: "db",
		});
	}

	public getSelectPromptListItems(
		types?: ResourceTemplateType[],
	): ResourceTemplatesSelectPromptListItems {
		if (types === undefined) {
			return Array.from(this.map.entries()).map(([key, value]) => ({
				name: value.name,
				value: key,
			}));
		}
		return Array.from(this.map.entries())
			.filter(([_, value]) => types.includes(value.type))
			.map(([key, value]) => ({
				name: value.name,
				value: key,
			}));
	}
}
