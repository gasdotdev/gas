import fs from "node:fs/promises";

export type UpJsonConfig = Record<string, unknown>;

export type UpJsonDependencies = string[];

export type UpJsonOutput = Record<string, unknown>;

export type UpJson = {
	[name: string]: {
		config: UpJsonConfig;
		dependencies: UpJsonDependencies;
		output: UpJsonOutput;
	};
};

export async function getUpJson(path: string): Promise<UpJson> {
	const data = await fs.readFile(path, "utf8");
	return JSON.parse(data) as UpJson;
}

export type UpJsonNameToDependencies = {
	[name: string]: UpJsonDependencies;
};

export function setUpJsonNameToDependencies(
	upJson: UpJson,
): UpJsonNameToDependencies {
	const res: UpJsonNameToDependencies = {};
	for (const name in upJson) {
		res[name] = upJson[name].dependencies;
	}
	return res;
}
