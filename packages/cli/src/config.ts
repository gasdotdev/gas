import fs from "node:fs/promises";

interface ConfigJson {
	resourceContainerDirPath?: string;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	[key: string]: any;
}

export class Config {
	private json: ConfigJson;
	public containerDirPath: string;

	private constructor() {
		this.json = {};
		this.containerDirPath = "";
	}

	public static async new(): Promise<Config> {
		const config = new Config();
		await config.setJson();
		config.setContainerDirPath();
		return config;
	}

	private async setJson(): Promise<void> {
		const configPath = "gas.config.json";

		try {
			const data = await fs.readFile(configPath, "utf8");
			this.json = JSON.parse(data) as ConfigJson;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				this.json = {};
			} else {
				throw new Error(
					`Failed to read gas.config.json: ${(err as Error).message}`,
				);
			}
		}
	}

	private setContainerDirPath(): void {
		if (typeof this.json.resourceContainerDirPath === "string") {
			this.containerDirPath = this.json.resourceContainerDirPath;
		} else {
			this.containerDirPath = "./gas";
		}
	}
}
