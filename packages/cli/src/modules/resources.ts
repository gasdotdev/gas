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
import type { UpResources } from "./up-resources.js";

type PackageJson = Record<string, unknown>;

export type ResourceContainerDirPath = string;

export type ResourceContainerSubdirPaths = string[];

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

export type Resource = {
	entityGroup: string;
	entity: string;
	cloud: string;
	cloudService: string;
	descriptor: string;
};

export type ResourceList = Resource[];

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

export type ResourceNameToPackageJson = Record<string, PackageJson>;

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

export type ResourceNameToDependencies = Record<string, string[]>;

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

export type ResourceNameToIndexFilePath = Record<string, string>;

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

export type ResourceNameToBuildIndexFilePath = Record<string, string>;

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

export type ResourceNameToIndexFileContent = Record<string, string>;

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

type ConfigData = {
	variableName: string;
	functionName: string;
	exportString: string;
};

export type ResourceNameToConfigData = Record<string, ConfigData>;

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

export type ResourceNodeJsConfigScript = string;

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

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type ResourceConfig = Record<string, any>;

export type ResourceNameToConfig = Record<string, ResourceConfig>;

function setNameToConfig(
	runNodeJsConfigScriptResult: ResourceRunNodeJsConfigScriptResult,
): ResourceNameToConfig {
	return { ...runNodeJsConfigScriptResult };
}

export type ResourceRunNodeJsConfigScriptResult = Record<
	string,
	ResourceConfig
>;

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

export type ResourceGroupToDepthToNames = GraphGroupToDepthToNodes;

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
	groupToDepthToNames: ResourceGroupToDepthToNames;
	namesWithIndegreesOfZero: GraphNodesWithInDegreesOfZero;
	nameToIntermediates: GraphNodeToIntermediates;
	depthToNames: GraphDepthToNodes;
	nameToDepth: GraphNodeToDepth;
	nodeJsConfigScript: ResourceNodeJsConfigScript;
	runNodeJsConfigScriptResult: ResourceRunNodeJsConfigScriptResult;
	nameToConfig: ResourceNameToConfig;
};

type FactoryOptions = {
	upResources: UpResources;
};

/**
 *
 * @param options.upResources - Used in deployments to account for deleted resources.
 * Deleted resources are present in `gas.up.json` but not the resource container dir.
 * For example, if Resource X depends on Resource Y and Resource Y gets deleted,
 * Resource Y would no longer exist in the resource container dir. The only record of
 * Resource Y would be in `gas.up.json`. Therefore, the resource dependency data from
 * both are merged before graphing the resources. Only then, when all resources have
 * been accounted for, can a sufficient graph be generated for deployment.
 */
async function factory(
	containerDirPath: ResourceContainerDirPath,
	options?: FactoryOptions,
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

	if (options?.upResources) {
		const upResourceNameToDependencies: ResourceNameToDependencies = {};

		for (const name in options.upResources) {
			upResourceNameToDependencies[name] =
				options.upResources[name].dependencies;
		}

		nameToDependencies = {
			...upResourceNameToDependencies,
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

async function init(
	containerDirPath: ResourceContainerDirPath,
): Promise<Resources> {
	return await factory(containerDirPath);
}

export async function setResources(
	containerDirPath: ResourceContainerDirPath,
): Promise<Resources> {
	return await init(containerDirPath);
}

export type ResourceNameToState = {
	[name: string]: "CREATED" | "DELETED" | "PENDING" | "UNCHANGED" | "UPDATED";
};

function setNameToState(
	nameToConfig: ResourceNameToConfig,
	nameToDependencies: ResourceNameToDependencies,
	upResources: UpResources,
): ResourceNameToState {
	const nameToState: ResourceNameToState = {};

	for (const name in upResources) {
		if (!(name in nameToConfig)) {
			nameToState[name] = "DELETED";
		}
	}

	for (const name in nameToConfig) {
		if (!(name in upResources)) {
			nameToState[name] = "CREATED";
		} else {
			if (
				JSON.stringify(nameToConfig[name]) !==
				JSON.stringify(upResources[name].config)
			) {
				nameToState[name] = "UPDATED";
				continue;
			}

			if (
				JSON.stringify(nameToDependencies[name]) !==
				JSON.stringify(upResources[name].dependencies)
			) {
				nameToState[name] = "UPDATED";
				continue;
			}

			nameToState[name] = "UNCHANGED";
		}
	}

	return nameToState;
}

export type ResourcesWithUp = Resources & {
	nameToState: ResourceNameToState;
};

async function initWithUp(
	containerDirPath: ResourceContainerDirPath,
	upResources: UpResources,
): Promise<ResourcesWithUp> {
	const resources = await factory(containerDirPath, {
		upResources,
	});

	const nameToState = setNameToState(
		resources.nameToConfig,
		resources.nameToDependencies,
		upResources,
	);

	return { ...resources, nameToState };
}

export async function setResourcesWithUp(
	containerDirPath: ResourceContainerDirPath,
	upResources: UpResources,
): Promise<ResourcesWithUp> {
	return await initWithUp(containerDirPath, upResources);
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
