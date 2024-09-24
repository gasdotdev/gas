import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
	type GraphDepthToNodes,
	type GraphGroupToDepthToNodes,
	type GraphNodeToDepth,
	type GraphNodeToIntermediates,
	type GraphNodesWithInDegreesOfZero,
	setGraph,
} from "./graph.js";
import type { UpJsonNameToDependencies } from "./up-json.js";

type PackageJson = Record<string, unknown>;

export type ResourceContainerDirPath = string;

export type ResourceContainerSubdirPaths = string[];

export type Resource = {
	entityGroup: string;
	entity: string;
	cloud: string;
	cloudService: string;
	descriptor: string;
};

export type ResourceList = Resource[];

export type ResourceNameToPackageJson = Record<string, PackageJson>;

export type ResourceNameToDependencies = Record<string, string[]>;

export type ResourceNameToIndexFilePath = Record<string, string>;

export type ResourceNameToBuildIndexFilePath = Record<string, string>;

export type ResourceNameToIndexFileContent = Record<string, string>;

export type ResourceNameToConfigData = Record<string, ConfigData>;

export type ResourceNodeJsConfigScript = string;

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type ResourceConfig = Record<string, any>;

export type ResourceNameToConfig = Record<string, ResourceConfig>;

export type ResourceRunNodeJsConfigScriptResult = Record<
	string,
	ResourceConfig
>;

export type Resources = {
	containerDirPath: ResourceContainerDirPath;
	containerSubdirPaths: ResourceContainerSubdirPaths;
	list: ResourceList;
	nameToPackageJson: ResourceNameToPackageJson;
	nameToIndexFilePath: ResourceNameToIndexFilePath;
	nameToBuildIndexFilePath: ResourceNameToBuildIndexFilePath;
	nameToIndexFileContent: ResourceNameToIndexFileContent;
	nameToConfigData: ResourceNameToConfigData;
	nameToDependencies: ResourceNameToDependencies;
	groupToDepthToNames: GraphGroupToDepthToNodes;
	namesWithIndegreesOfZero: GraphNodesWithInDegreesOfZero;
	nameToIntermediates: GraphNodeToIntermediates;
	depthToNames: GraphDepthToNodes;
	nameToDepth: GraphNodeToDepth;
	nodeJsConfigScript: ResourceNodeJsConfigScript;
	runNodeJsConfigScriptResult: ResourceRunNodeJsConfigScriptResult;
	nameToConfig: ResourceNameToConfig;
};

interface ConfigData {
	variableName: string;
	functionName: string;
	exportString: string;
}

type SetResourcesOptions = {
	upJsonNameToDependencies: UpJsonNameToDependencies;
};

/**
 * Set resources.
 *
 * @param containerDirPath - Path to resource container dir (e.g. `./gas`).
 * @param options.upJsonNameToDependencies - `UpJsonNameToDependencies` object.
 * It gets merged with the `ResourceNameToDependencies` object (with
 * `ResourceNameToDependencies` taking precedence). It's used when deploying
 * resources via the `up` command.
 *
 * The reason is resources can be derived from:
 * 1) The resource container dir.
 * 2) The up .json file (e.g. `./gas.up.json`).
 *
 * - Resources derived from the resource container dir are considered as being current
 * resources. They're a snapshot of the system's resources as they currently exist.
 *
 * - Resources derived from the up .json file are a mixture of current and past
 * resources -- depending on what changes have or haven't been made. They're a snapshot
 * of the system's resources on last deploy to the cloud.
 *
 * When deploying resources via the `up` command, it's necessary to account for resources
 * that exist in the up .json file but not as current resources (i.e. deleted resources).
 * For example, if Resource A depends on Resource B and Resource B gets deleted, Resource B
 * would no longer exist in the resource container dir. The only record of Resource B would
 * be in the up .json file. Therefore, `UpJsonNameToDependencies` and `ResourceNameToDependencies`
 * have to be merged. Only then, when all resources have been accounted for, can a proper resource
 * graph be constructed for deployment.
 * @returns Resources.
 */
export async function setResources(
	containerDirPath: ResourceContainerDirPath,
	options?: SetResourcesOptions,
): Promise<Resources> {
	const containerSubdirPaths = await setContainerSubdirPaths(containerDirPath);

	const list = setList(containerSubdirPaths);

	const nameToPackageJson = await setNameToPackageJson(containerSubdirPaths);

	const nameToIndexFilePath =
		await setNameToIndexFilePath(containerSubdirPaths);

	const nameToBuildIndexFilePath = setNameToBuildIndexFilePath(
		containerDirPath,
		nameToIndexFilePath,
	);

	const nameToIndexFileContent =
		await setNameToIndexFileContent(nameToIndexFilePath);

	const nameToConfigData = setNameToConfigData(nameToIndexFileContent);

	let nameToDependencies = setNameToDependencies(nameToPackageJson);

	if (options?.upJsonNameToDependencies) {
		nameToDependencies = {
			...options.upJsonNameToDependencies,
			...nameToDependencies,
		};
	}

	const graph = setGraph(nameToDependencies);

	const groupToDepthToNames = graph.groupToDepthToNodes;

	const namesWithIndegreesOfZero = graph.nodesWithInDegreesOfZero;

	const nameToIntermediates = graph.nodeToIntermediates;

	const depthToNames = graph.depthToNodes;

	const nameToDepth = graph.nodeToDepth;

	const nodeJsConfigScript = setNodeJsConfigScript(
		nameToConfigData,
		groupToDepthToNames,
	);

	const runNodeJsConfigScriptResult =
		await runNodeJsConfigScript(nodeJsConfigScript);

	const nameToConfig = setNameToConfig(runNodeJsConfigScriptResult);

	return {
		containerDirPath,
		containerSubdirPaths,
		list,
		nameToPackageJson,
		nameToDependencies,
		nameToIndexFilePath,
		nameToBuildIndexFilePath,
		nameToIndexFileContent,
		nameToConfigData,
		groupToDepthToNames,
		namesWithIndegreesOfZero,
		nameToIntermediates,
		depthToNames,
		nameToDepth,
		nodeJsConfigScript,
		runNodeJsConfigScriptResult,
		nameToConfig,
	};
}

export function setResourcesFromMemory(data: Resources): Resources {
	return { ...data };
}

async function setContainerSubdirPaths(
	containerDirPath: ResourceContainerDirPath,
): Promise<ResourceContainerSubdirPaths> {
	try {
		const entries = await fs.readdir(containerDirPath, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(containerDirPath, entry.name));
	} catch (err) {
		throw new Error(
			`Unable to read resource container dir ${containerDirPath}: ${(err as Error).message}`,
		);
	}
}

function setList(
	containerSubdirPaths: ResourceContainerSubdirPaths,
): ResourceList {
	return containerSubdirPaths.map((subdirPath) => {
		const subdirName = path.basename(subdirPath);
		const [entityGroup, entity, cloud, cloudService, descriptor] =
			subdirName.split("-");
		return { entityGroup, entity, cloud, cloudService, descriptor };
	});
}

function convertContainerSubdirPathToName(subdirPath: string): string {
	const subdirName = path.basename(subdirPath);
	return subdirName.replace(/-/g, "_").toUpperCase();
}

async function setNameToPackageJson(
	containerSubdirPaths: ResourceContainerSubdirPaths,
): Promise<ResourceNameToPackageJson> {
	const res: ResourceNameToPackageJson = {};
	for (const subdirPath of containerSubdirPaths) {
		const resourceName = convertContainerSubdirPathToName(subdirPath);
		const packageJsonPath = path.join(subdirPath, "package.json");

		try {
			const data = await fs.readFile(packageJsonPath, "utf8");
			const packageJson: PackageJson = JSON.parse(data);
			res[resourceName] = packageJson;
		} catch (err) {
			throw new Error(`Unable to read or parse ${packageJsonPath}: ${err}`);
		}
	}
	return res;
}

function setNameToDependencies(
	nameToPackageJson: ResourceNameToPackageJson,
): ResourceNameToDependencies {
	const res: ResourceNameToDependencies = {};
	for (const name in nameToPackageJson) {
		const packageJson = nameToPackageJson[name];
		const resourceDependencies: string[] = [];
		const packageJsonDependencies = packageJson.dependencies as
			| Record<string, string>
			| undefined;
		if (packageJsonDependencies) {
			for (const packageJsonDependency in packageJsonDependencies) {
				const internalDep = nameToPackageJson[packageJsonDependency];
				if (internalDep) {
					resourceDependencies.push(packageJsonDependency);
				}
			}
		}
		res[name] = resourceDependencies;
	}
	return res;
}

async function setNameToIndexFilePath(
	containerSubdirPaths: ResourceContainerSubdirPaths,
): Promise<ResourceNameToIndexFilePath> {
	const res: ResourceNameToIndexFilePath = {};
	const indexFilePathPattern = /^index\.[^.]+\.[^.]+\.[^.]+\.[^.]+\.[^.]+\.ts$/;
	for (const subdirPath of containerSubdirPaths) {
		const resourceName = convertContainerSubdirPathToName(subdirPath);
		const srcPath = path.join(subdirPath, "src");

		try {
			const srcStats = await fs.stat(srcPath);
			if (!srcStats.isDirectory()) continue;

			const files = await fs.readdir(srcPath);
			for (const file of files) {
				if (indexFilePathPattern.test(file)) {
					res[resourceName] = path.join(srcPath, file);
					break;
				}
			}
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
				throw new Error(
					`Unable to read src dir ${srcPath}: ${(err as Error).message}`,
				);
			}
		}
	}
	return res;
}

function setNameToBuildIndexFilePath(
	containerDirPath: ResourceContainerDirPath,
	nameToIndexFilePath: ResourceNameToIndexFilePath,
): ResourceNameToBuildIndexFilePath {
	const res: ResourceNameToBuildIndexFilePath = {};
	for (const name in nameToIndexFilePath) {
		const indexFilePath = nameToIndexFilePath[name];
		const relativePath = path.relative(containerDirPath, indexFilePath);
		const parts = relativePath.split(path.sep);
		parts.splice(1, 0, "build");
		const buildPath = path.join(containerDirPath, ...parts);
		res[name] = buildPath.replace(/\.ts$/, ".js");
	}
	return res;
}

async function setNameToIndexFileContent(
	nameToIndexFilePath: ResourceNameToIndexFilePath,
): Promise<ResourceNameToIndexFileContent> {
	const res: ResourceNameToIndexFileContent = {};
	for (const name in nameToIndexFilePath) {
		const indexFilePath = nameToIndexFilePath[name];
		try {
			const content = await fs.readFile(indexFilePath, "utf8");
			res[name] = content;
		} catch (err) {
			throw new Error(
				`Unable to read file ${indexFilePath}: ${(err as Error).message}`,
			);
		}
	}
	return res;
}

function setNameToConfigData(
	nameToIndexFileContent: ResourceNameToIndexFileContent,
): ResourceNameToConfigData {
	const res: ResourceNameToConfigData = {};
	for (const name in nameToIndexFileContent) {
		const indexFileContent = nameToIndexFileContent[name];
		const configSetterFunctionNameRegex =
			/import\s+\{[^}]*\b([a-z]+[A-Z][a-zA-Z]*)\b[^}]*\}\s+from\s+['"]@gasdotdev\/resources['"]/;
		const configSetterFunctionNameMatch = indexFileContent.match(
			configSetterFunctionNameRegex,
		);
		if (!configSetterFunctionNameMatch) continue;
		const configSetterFunctionName = configSetterFunctionNameMatch[1];

		const exportedConfigRegex =
			/export\s+const\s+\w+\s*=\s*\w+\([\s\S]*?\)\s*(?:as\s*const\s*)?;?/gm;
		const possibleExportedConfigs =
			indexFileContent.match(exportedConfigRegex) || [];

		const possibleExportedConfigVariableNameRegex =
			/export\s+const\s+(\w+)\s*=\s*\w+\(/;
		const functionNameRegex = /\s*=\s*(\w+)\(/;

		for (const possibleExportedConfig of possibleExportedConfigs) {
			const functionNameMatch = possibleExportedConfig.match(functionNameRegex);
			if (!functionNameMatch) continue;
			const possibleExportedConfigFunctionName = functionNameMatch[1];

			if (possibleExportedConfigFunctionName === configSetterFunctionName) {
				const variableNameMatch = possibleExportedConfig.match(
					possibleExportedConfigVariableNameRegex,
				);
				if (!variableNameMatch) continue;

				res[name] = {
					variableName: variableNameMatch[1],
					functionName: possibleExportedConfigFunctionName,
					exportString: possibleExportedConfig,
				};
				break;
			}
		}
	}
	return res;
}

function setNodeJsConfigScript(
	nameToConfigData: ResourceNameToConfigData,
	groupToDepthToNames: GraphGroupToDepthToNodes,
): ResourceNodeJsConfigScript {
	if (Object.keys(groupToDepthToNames).length === 0) {
		return "";
	}

	const functionNames = Object.values(nameToConfigData).map(
		(data) => data.functionName,
	);
	let script = `import {\n${functionNames.join(",\n")}\n} from "@gasdotdev/resources"\n`;

	for (const group of Object.keys(groupToDepthToNames).map(Number)) {
		const numOfDepths = Object.keys(groupToDepthToNames[group]).length;
		for (let depth = numOfDepths - 1; depth >= 0; depth--) {
			for (const name of groupToDepthToNames[group][depth] || []) {
				if (nameToConfigData[name]) {
					script += `${nameToConfigData[name].exportString.replace(" as const", "")}\n`;
				}
			}
		}
	}

	script += "const resourceNameToConfig = {};\n";
	for (const name in nameToConfigData) {
		const configData = nameToConfigData[name];
		script += `resourceNameToConfig["${name}"] = ${configData.variableName};\n`;
	}
	script += "console.log(JSON.stringify(resourceNameToConfig));\n";

	return script;
}

async function runNodeJsConfigScript(
	nodeJsConfigScript: ResourceNodeJsConfigScript,
): Promise<ResourceRunNodeJsConfigScriptResult> {
	if (nodeJsConfigScript === "") {
		return {};
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
					resolve(JSON.parse(stdout.trim()));
				} catch (err) {
					reject(
						new Error(
							`Unable to parse Node.js config script result: ${(err as Error).message}`,
						),
					);
				}
			}
		});

		child.stdin.write(nodeJsConfigScript);
		child.stdin.end();
	});
}

function setNameToConfig(
	runNodeJsConfigScriptResult: ResourceRunNodeJsConfigScriptResult,
): ResourceNameToConfig {
	return { ...runNodeJsConfigScriptResult };
}

export function setResource(input: Resource): Resource {
	return {
		entityGroup: input.entityGroup.toLowerCase(),
		entity: input.entity.toLowerCase(),
		cloud: input.cloud.toLowerCase(),
		cloudService: input.cloudService.toLowerCase(),
		descriptor: input.descriptor.toLowerCase(),
	};
}

export type ResourceEntityGroups = string[];

export function setResourceEntityGroups(
	resourceList: ResourceList,
	descriptorFilters?: string[],
): ResourceEntityGroups {
	const entityGroupSet = new Set<string>();
	for (const resource of resourceList) {
		if (
			(!descriptorFilters ||
				descriptorFilters.length === 0 ||
				descriptorFilters.includes(resource.descriptor)) &&
			!entityGroupSet.has(resource.entityGroup)
		) {
			entityGroupSet.add(resource.entityGroup);
		}
	}
	return Array.from(entityGroupSet);
}

export type ResourceEntities = string[];

export function setResourceEntities(
	resourceList: ResourceList,
	descriptorFilters?: string[],
): ResourceEntities {
	const entitySet = new Set<string>();
	for (const resource of resourceList) {
		if (
			(!descriptorFilters ||
				descriptorFilters.length === 0 ||
				descriptorFilters.includes(resource.descriptor)) &&
			!entitySet.has(resource.entity)
		) {
			entitySet.add(resource.entity);
		}
	}
	return Array.from(entitySet);
}
