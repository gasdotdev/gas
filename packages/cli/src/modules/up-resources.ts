import fs from "node:fs/promises";

export type UpResourceConfig = Record<string, unknown>;

export type UpResourceDependencies = string[];

export type UpResourceOutput = Record<string, unknown>;

export type UpResources = {
	[name: string]: {
		config: UpResourceConfig;
		dependencies: UpResourceDependencies;
		output: UpResourceOutput;
	};
};

export async function setUpResources(path: string): Promise<UpResources> {
	const data = await fs.readFile(path, "utf8");
	return JSON.parse(data) as UpResources;
}
