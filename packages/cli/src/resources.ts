import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { Graph, type GraphGroupToDepthToNodes } from "./graph.js";

type PackageJson = Record<string, unknown>;

interface ConfigData {
	variableName: string;
	functionName: string;
	exportString: string;
}

interface ConfigCommon {
	type: string;
	name: string;
}

interface CloudflareKVConfig extends ConfigCommon {}

interface CloudflareWorkerConfig extends ConfigCommon {
	kv: Array<{ binding: string }>;
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type ResourceConfig = Record<string, any>;

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const resourceConfigs: Record<string, (config: ResourceConfig) => any> = {
	"cloudflare-kv": (config: ResourceConfig): CloudflareKVConfig => ({
		type: config.type as string,
		name: config.name as string,
	}),
	"cloudflare-worker": (config: ResourceConfig): CloudflareWorkerConfig => ({
		type: config.type as string,
		name: config.name as string,
		kv: (config.kv as Array<{ binding: string }>) || [],
	}),
};

export class Resources {
	public containerDirPath: string;
	private containerSubdirPaths: string[];
	private nameToPackageJson: Map<string, PackageJson> = new Map();
	private packageJsonNameToName: Map<string, string> = new Map();
	private nameToDeps: Record<string, string[]> = {};
	private nameToIndexFilePath: Record<string, string> = {};
	private nameToIndexFileContent: Record<string, string> = {};
	private nameToConfigData: Record<string, ConfigData> = {};
	private nodeJsConfigScript: string;
	private runNodeJsConfigScriptResult: Record<string, ResourceConfig> = {};
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	public nameToConfig: Record<string, any> = {};

	public static async new(containerDirPath: string): Promise<Resources> {
		const resources = new Resources();
		resources.containerDirPath = containerDirPath;
		await resources.setContainerSubdirPaths();
		await resources.setNameToPackageJson();
		resources.setPackageJsonNameToName();
		resources.setNameToDeps();
		await resources.setNameToIndexFilePath();
		await resources.setNameToIndexFileContent();
		resources.setNameToConfigData();
		const graph = Graph.new(resources.nameToDeps);
		resources.setNodeJsConfigScript(graph.groupToDepthToNodes);
		await resources.runNodeJsConfigScript();
		resources.setNameToConfig();
		return resources;
	}

	private async setContainerSubdirPaths(): Promise<void> {
		try {
			const entries = await fs.readdir(this.containerDirPath, {
				withFileTypes: true,
			});

			const containerSubdirPaths = entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => path.join(this.containerDirPath, entry.name));

			this.containerSubdirPaths = containerSubdirPaths;
		} catch (err) {
			throw new Error(
				`Unable to read resource container dir ${this.containerDirPath}: ${(err as Error).message}`,
			);
		}
	}

	private convertContainerSubdirPathToName(subdirPath: string): string {
		const subdirName = path.basename(subdirPath);
		const snakeCaseResourceName = subdirName.replace(/-/g, "_");
		const screamingSnakeCaseResourceName = snakeCaseResourceName.toUpperCase();
		return screamingSnakeCaseResourceName;
	}

	private async setNameToPackageJson(): Promise<void> {
		const readPromises = this.containerSubdirPaths.map(async (subdirPath) => {
			const resourceName = this.convertContainerSubdirPathToName(subdirPath);
			const packageJsonPath = path.join(subdirPath, "package.json");

			try {
				const data = await fs.readFile(packageJsonPath, "utf8");
				const packageJson: PackageJson = JSON.parse(data);
				return { resourceName, packageJson };
			} catch (err) {
				throw new Error(`Unable to read or parse ${packageJsonPath}: ${err}`);
			}
		});

		const results = await Promise.all(readPromises);

		for (const { resourceName, packageJson } of results) {
			this.nameToPackageJson.set(resourceName, packageJson);
		}
	}

	private setPackageJsonNameToName(): void {
		for (const [resourceName, packageJson] of this.nameToPackageJson) {
			const name = packageJson.name as string;
			this.packageJsonNameToName.set(name, resourceName);
		}
	}

	private setNameToDeps(): void {
		for (const [resourceName, packageJson] of this.nameToPackageJson) {
			const deps: string[] = [];
			// Loop over source resource's package.json deps
			const dependencies = packageJson.dependencies as
				| Record<string, string>
				| undefined;
			if (dependencies) {
				for (const dep in dependencies) {
					const internalDep = this.packageJsonNameToName.get(dep);
					// If package.json dep exists in map then it's an internal dep
					if (internalDep) {
						deps.push(internalDep);
					}
				}
			}
			this.nameToDeps[resourceName] = deps;
		}
	}

	private async setNameToIndexFilePath(): Promise<void> {
		const indexFilePathPattern = /^_[^.]+\.[^.]+\.[^.]+\.index\.ts$/;

		const processSubdirPromises = this.containerSubdirPaths.map(
			async (subdirPath) => {
				const resourceName = this.convertContainerSubdirPathToName(subdirPath);

				try {
					const files = await fs.readdir(subdirPath);

					const fileStatPromises = files.map(async (file) => {
						const filePath = path.join(subdirPath, file);
						const fileStat = await fs.stat(filePath);
						return { file, fileStat, filePath };
					});

					const fileStats = await Promise.all(fileStatPromises);

					for (const { file, fileStat, filePath } of fileStats) {
						if (!fileStat.isDirectory() && indexFilePathPattern.test(file)) {
							return { resourceName, indexFilePath: filePath };
						}
					}
				} catch (err) {
					throw new Error(
						`Unable to read dir ${subdirPath}: ${(err as Error).message}`,
					);
				}
			},
		);

		const results = await Promise.all(processSubdirPromises);

		for (const result of results) {
			if (result?.indexFilePath) {
				this.nameToIndexFilePath[result.resourceName] = result.indexFilePath;
			}
		}
	}

	private async setNameToIndexFileContent(): Promise<void> {
		const readPromises = Object.entries(this.nameToIndexFilePath).map(
			async ([name, indexFilePath]) => {
				try {
					const data = await fs.readFile(indexFilePath, "utf8");
					return { name, content: data };
				} catch (err) {
					throw new Error(
						`Unable to read file ${indexFilePath}: ${(err as Error).message}`,
					);
				}
			},
		);

		try {
			const results = await Promise.all(readPromises);
			for (const { name, content } of results) {
				this.nameToIndexFileContent[name] = content;
			}
		} catch (err) {
			throw new Error(`Error reading index files: ${(err as Error).message}`);
		}
	}

	private setNameToConfigData(): void {
		for (const [name, indexFileContent] of Object.entries(
			this.nameToIndexFileContent,
		)) {
			// Config setters are imported like this:
			// import { cloudflareKv } from "@gasdotdev/resources"
			// They can be distinguished using a camelCase pattern.
			const configSetterFunctionNameRegex =
				/import\s+\{[^}]*\b([a-z]+[A-Z][a-zA-Z]*)\b[^}]*\}\s+from\s+['"]@gasdotdev\/resources['"]/;
			const configSetterFunctionNameMatch = indexFileContent.match(
				configSetterFunctionNameRegex,
			);
			if (!configSetterFunctionNameMatch) continue;
			const configSetterFunctionName = configSetterFunctionNameMatch[1];

			// Configs are exported like this:
			// export const coreBaseKv = cloudflareKv({
			//   name: "CORE_BASE_KV",
			// } as const)
			const exportedConfigRegex =
				/export\s+const\s+\w+\s*=\s*\w+\([\s\S]*?\)\s*(?:as\s*const\s*)?;?/gm;
			const possibleExportedConfigs =
				indexFileContent.match(exportedConfigRegex) || [];

			const possibleExportedConfigVariableNameRegex =
				/export\s+const\s+(\w+)\s*=\s*\w+\(/;
			const functionNameRegex = /\s*=\s*(\w+)\(/;

			for (const possibleExportedConfig of possibleExportedConfigs) {
				const functionNameMatch =
					possibleExportedConfig.match(functionNameRegex);
				if (!functionNameMatch) continue;
				const possibleExportedConfigFunctionName = functionNameMatch[1];

				if (possibleExportedConfigFunctionName === configSetterFunctionName) {
					const variableNameMatch = possibleExportedConfig.match(
						possibleExportedConfigVariableNameRegex,
					);
					if (!variableNameMatch) continue;

					this.nameToConfigData[name] = {
						variableName: variableNameMatch[1],
						functionName: possibleExportedConfigFunctionName,
						exportString: possibleExportedConfig,
					};
					break;
				}
			}
		}
	}

	public setNodeJsConfigScript(
		groupToDepthToNames: GraphGroupToDepthToNodes,
	): void {
		if (Object.keys(groupToDepthToNames).length > 0) {
			const functionNames: string[] = [];
			const functionNameToTrue: Record<string, boolean> = {};

			for (const configData of Object.values(this.nameToConfigData)) {
				functionNameToTrue[configData.functionName] = true;
				functionNames.push(configData.functionName);
			}

			this.nodeJsConfigScript = "import {\n";
			this.nodeJsConfigScript += functionNames.join(",\n");
			this.nodeJsConfigScript += "\n} ";
			this.nodeJsConfigScript += 'from "@gasdotdev/resources"\n';

			// Configs have to be written in bottom-up dependency order to
			// avoid Node.js "cannot access 'variable name' before
			// initialization" errors. For example, given a graph of A->B,
			// B's config has to be written before A's because A will
			// reference B's config.
			for (const group of Object.keys(groupToDepthToNames).map(Number)) {
				const numOfDepths = Object.keys(groupToDepthToNames[group]).length;
				for (let depth = numOfDepths - 1; depth >= 0; depth--) {
					for (const name of groupToDepthToNames[group][depth] || []) {
						if (this.nameToConfigData[name]) {
							this.nodeJsConfigScript += this.nameToConfigData[
								name
							].exportString.replace(" as const", "");
							this.nodeJsConfigScript += "\n";
						}
					}
				}
			}

			this.nodeJsConfigScript += "const resourceNameToConfig = {};\n";

			for (const [name, configData] of Object.entries(this.nameToConfigData)) {
				this.nodeJsConfigScript += `resourceNameToConfig["${name}"] = ${configData.variableName};\n`;
			}

			this.nodeJsConfigScript +=
				"console.log(JSON.stringify(resourceNameToConfig));\n";
		} else {
			this.nodeJsConfigScript = "";
		}
	}

	public async runNodeJsConfigScript(): Promise<void> {
		if (this.nodeJsConfigScript === "") {
			this.runNodeJsConfigScriptResult = {};
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			const child = spawn("node", ["--input-type=module"], {
				stdio: ["pipe", "pipe", "pipe"],
			});

			let stdout = "";
			let stderr = "";

			child.stdout.on("data", (data) => {
				stdout += data.toString();
			});

			child.stderr.on("data", (data) => {
				stderr += data.toString();
			});

			child.on("close", (code) => {
				if (code !== 0) {
					reject(new Error(`Node.js script execution error: ${stderr}`));
				} else {
					try {
						const strOutput = stdout.trim();
						this.runNodeJsConfigScriptResult = JSON.parse(strOutput);
						resolve();
					} catch (err) {
						reject(
							new Error(
								`Unable to parse Node.js config script result: ${(err as Error).message}`,
							),
						);
					}
				}
			});

			child.stdin.write(this.nodeJsConfigScript);
			child.stdin.end();
		});
	}

	public setNameToConfig(): void {
		for (const [name, config] of Object.entries(
			this.runNodeJsConfigScriptResult,
		)) {
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			const c = config as Record<string, any>;
			const resourceType = c.type as string;
			this.nameToConfig[name] = resourceConfigs[resourceType](c);
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	public getNameToConfig(): Record<string, any> {
		return { ...this.nameToConfig };
	}
}
