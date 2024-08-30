import fs from "node:fs/promises";
import path from "node:path";

type PackageJson = Record<string, unknown>;

interface ConfigData {
	variableName: string;
	functionName: string;
	exportString: string;
}

export class Resources {
	public containerDirPath: string;
	private containerSubdirPaths: string[];
	private nameToPackageJson: Map<string, PackageJson> = new Map();
	private packageJsonNameToName: Map<string, string> = new Map();
	private nameToDeps: Record<string, string[]> = {};
	private nameToIndexFilePath: Record<string, string> = {};
	private nameToIndexFileContent: Record<string, string> = {};
	private nameToConfigData: Record<string, ConfigData> = {};

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
			// import { cloudflareKv } from "@gasoline-dev/resources"
			// They can be distinguished using a camelCase pattern.
			const configSetterFunctionNameRegex =
				/import\s+\{[^}]*\b([a-z]+[A-Z][a-zA-Z]*)\b[^}]*\}\s+from\s+['"]@gasoline-dev\/resources['"]/;
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
}
