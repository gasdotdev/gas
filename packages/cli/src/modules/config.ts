import fs from "node:fs/promises";

interface ConfigJson {
	resourceContainerDirPath?: string;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	[key: string]: any;
}

export interface Config {
	containerDirPath: string;
	upJsonPath: string;
}

export async function setConfig(): Promise<Config> {
	const json = await setJson();
	const containerDirPath = setContainerDirPath(json);
	const upJsonPath = setUpJsonPath(json);
	return { containerDirPath, upJsonPath };
}

async function setJson(): Promise<ConfigJson> {
	const configPath = "gas.config.json";

	try {
		const data = await fs.readFile(configPath, "utf8");
		return JSON.parse(data) as ConfigJson;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return {};
		}
		throw new Error(
			`Failed to read gas.config.json: ${(err as Error).message}`,
		);
	}
}

function setContainerDirPath(json: ConfigJson): string {
	if (typeof json.resourceContainerDirPath === "string") {
		return json.resourceContainerDirPath;
	}
	return "./gas";
}

function setUpJsonPath(json: ConfigJson): string {
	if (typeof json.resourceContainerDirPath === "string") {
		return json.resourceContainerDirPath;
	}
	return "./gas.up.json";
}
