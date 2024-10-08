import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { ResourceNameToUpOutput } from "../cmds/up.js";
import {
	type GraphDepthToNodes,
	type GraphGroupToDepthToNodes,
	type GraphGroupToNodes,
	type GraphNodeToDepth,
	type GraphNodeToGroup,
	type GraphNodeToInDegrees,
	type GraphNodeToIntermediates,
	type GraphNodesWithInDegreesOfZero,
	setGraph,
} from "./graph.js";
import { deepMergeObjects } from "./objects.js";
import { convertKebabCaseToCapitalSnakeCase } from "./strings.js";
import type { TurboSummary } from "./turbo.js";

//
// Main resource setters.
//

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
				const capitalSnakeCasePackageJsonDependency =
					convertKebabCaseToCapitalSnakeCase(packageJsonDependency);
				const internalDependency =
					nameToPackageJson[capitalSnakeCasePackageJsonDependency];
				if (internalDependency) {
					resourceDependencies.push(capitalSnakeCasePackageJsonDependency);
				}
			}
		}
		res[name] = resourceDependencies;
	}
	return res;
}

export type ResourceNameToFiles = {
	[name: string]: {
		configPath: string;
		buildPath: string;
		entityGroup: string;
		entity: string;
		cloud: string;
		cloudService: string;
		descriptor: string;
	};
};

async function setNameToFiles(
	containerDirPath: ResourceContainerDirPath,
	containerSubdirPaths: ResourceContainerSubdirPaths,
): Promise<ResourceNameToFiles> {
	const res: ResourceNameToFiles = {};

	const configPathPattern = /^index\.[^.]+\.[^.]+\.[^.]+\.[^.]+\.[^.]+\.ts$/;

	for (const subdirPath of containerSubdirPaths) {
		const resourceName = convertContainerSubdirPathToName(subdirPath);
		const srcPath = path.join(subdirPath, "src");

		try {
			const srcStats = await fs.stat(srcPath);
			if (!srcStats.isDirectory()) continue;

			const files = await fs.readdir(srcPath);
			for (const file of files) {
				if (configPathPattern.test(file)) {
					const configPath = path.join(srcPath, file);
					const relativePath = path.relative(containerDirPath, configPath);
					const parts = relativePath.split(path.sep);
					parts.splice(1, 0, "build");
					const buildPath = path
						.join(containerDirPath, ...parts)
						.replace(/\.ts$/, ".js");

					const [entityGroup, entity, cloud, cloudService, descriptor] = path
						.basename(subdirPath)
						.split("-");

					res[resourceName] = {
						configPath,
						buildPath,
						entityGroup,
						entity,
						cloud,
						cloudService,
						descriptor,
					};
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

export type ResourceNameToConfigFileContent = Record<string, string>;

async function setNameToConfigFileContent(
	nameToFiles: ResourceNameToFiles,
): Promise<ResourceNameToConfigFileContent> {
	const res: ResourceNameToConfigFileContent = {};
	for (const name in nameToFiles) {
		const configPath = nameToFiles[name].configPath;
		try {
			const content = await fs.readFile(configPath, "utf8");
			res[name] = content;
		} catch (err) {
			throw new Error(
				`Unable to read file ${configPath}: ${(err as Error).message}`,
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
	nameToConfigFileContent: ResourceNameToConfigFileContent,
): ResourceNameToConfigData {
	const res: ResourceNameToConfigData = {};
	for (const name in nameToConfigFileContent) {
		const configFileContent = nameToConfigFileContent[name];
		const configSetterFunctionNameRegex =
			/import\s+\{[^}]*\b([a-z]+[A-Z][a-zA-Z]*)\b[^}]*\}\s+from\s+['"]@gasdotdev\/resources['"]/;
		const configSetterFunctionNameMatch = configFileContent.match(
			configSetterFunctionNameRegex,
		);
		if (!configSetterFunctionNameMatch) continue;
		const configSetterFunctionName = configSetterFunctionNameMatch[1];

		const exportedConfigRegex =
			/export\s+const\s+\w+\s*=\s*\w+\([\s\S]*?\)\s*(?:as\s*const\s*)?;?/gm;
		const possibleExportedConfigs =
			configFileContent.match(exportedConfigRegex) || [];

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

	const functionNamesSet = new Set<string>();
	const functionNames: string[] = [];

	for (const name in nameToConfigData) {
		const functionName = nameToConfigData[name].functionName;
		if (!functionNamesSet.has(functionName)) {
			functionNamesSet.add(functionName);
			functionNames.push(functionName);
		}
	}

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
	nameToPackageJson: ResourceNameToPackageJson;
	nameToFiles: ResourceNameToFiles;
	nameToConfigFileContent: ResourceNameToConfigFileContent;
	nameToConfigData: ResourceNameToConfigData;
	nameToDependencies: ResourceNameToDependencies;
	nameToIndegrees: GraphNodeToInDegrees;
	namesWithIndegreesOfZero: GraphNodesWithInDegreesOfZero;
	nameToIntermediates: GraphNodeToIntermediates;
	nameToGroup: GraphNodeToGroup;
	groupToNames: GraphGroupToNodes;
	depthToNames: GraphDepthToNodes;
	nameToDepth: GraphNodeToDepth;
	groupToDepthToNames: ResourceGroupToDepthToNames;
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

	const nameToPackageJson = await setNameToPackageJson(containerSubdirPaths);

	const nameToFiles = await setNameToFiles(
		containerDirPath,
		containerSubdirPaths,
	);

	const nameToConfigFileContent = await setNameToConfigFileContent(nameToFiles);

	const nameToConfigData = setNameToConfigData(nameToConfigFileContent);

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

	const nameToIndegrees = graph.nodeToInDegrees;

	const namesWithIndegreesOfZero = graph.nodesWithInDegreesOfZero;

	const nameToIntermediates = graph.nodeToIntermediates;

	const nameToGroup = graph.nodeToGroup;

	const groupToNames = graph.groupToNodes;

	const depthToNames = graph.depthToNodes;

	const nameToDepth = graph.nodeToDepth;

	const groupToDepthToNames = graph.groupToDepthToNodes;

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
		nameToPackageJson,
		nameToDependencies,
		nameToIndegrees,
		namesWithIndegreesOfZero,
		nameToIntermediates,
		nameToGroup,
		groupToNames,
		groupToDepthToNames,
		nameToFiles,
		nameToConfigFileContent,
		nameToConfigData,
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

//
// Main resource helpers.
//
export type ResourceEntityGroups = string[];

export function setResourceEntityGroups(
	nameToFiles: ResourceNameToFiles,
	descriptorFilters?: string[],
): ResourceEntityGroups {
	const entityGroupSet = new Set<string>();
	for (const name in nameToFiles) {
		const files = nameToFiles[name];
		if (
			(!descriptorFilters ||
				descriptorFilters.length === 0 ||
				descriptorFilters.includes(files.descriptor)) &&
			!entityGroupSet.has(files.entityGroup)
		) {
			entityGroupSet.add(files.entityGroup);
		}
	}
	return Array.from(entityGroupSet);
}

export type ResourceEntities = string[];

export function setResourceEntities(
	nameToFiles: ResourceNameToFiles,
	descriptorFilters?: string[],
): ResourceEntities {
	const entitySet = new Set<string>();
	for (const name in nameToFiles) {
		const files = nameToFiles[name];
		if (
			(!descriptorFilters ||
				descriptorFilters.length === 0 ||
				descriptorFilters.includes(files.descriptor)) &&
			!entitySet.has(files.entity)
		) {
			entitySet.add(files.entity);
		}
	}
	return Array.from(entitySet);
}

//
// Up resource setters.
//

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

export type ResourceState = "CREATED" | "DELETED" | "UNCHANGED" | "UPDATED";

export type ResourceNameToState = {
	[name: string]: ResourceState;
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

export type ResourceDeployState =
	| "CANCELED"
	| "CREATE_COMPLETE"
	| "CREATE_FAILED"
	| "CREATE_IN_PROGRESS"
	| "DELETE_COMPLETE"
	| "DELETE_FAILED"
	| "DELETE_IN_PROGRESS"
	| "PENDING"
	| "UPDATE_COMPLETE"
	| "UPDATE_FAILED"
	| "UPDATE_IN_PROGRESS";

export type ResourceNameToDeployState = {
	[name: string]: ResourceState | ResourceDeployState;
};

type GroupsWithStateChanges = number[];

function setGroupsWithStateChanges(
	nameToState: ResourceNameToState,
	nameToGroup: GraphNodeToGroup,
): GroupsWithStateChanges {
	const res: GroupsWithStateChanges = [];
	const seenGroups = new Set<number>();
	for (const name in nameToState) {
		if (nameToState[name] !== "UNCHANGED") {
			const group = nameToGroup[name];
			if (!seenGroups.has(group)) {
				res.push(group);
				seenGroups.add(group);
			}
		}
	}
	return res;
}

type GroupToHighestDeployDepth = {
	[group: number]: number;
};

function setGroupToHighestDeployDepth(
	groupsWithStateChanges: GroupsWithStateChanges,
	groupToNames: GraphGroupToNodes,
	nameToState: ResourceNameToState,
	nameToDepth: GraphNodeToDepth,
): GroupToHighestDeployDepth {
	const res: GroupToHighestDeployDepth = {};

	for (const group of groupsWithStateChanges) {
		let deployDepth = 0;
		let isFirstResourceToProcess = true;

		for (const name of groupToNames[group]) {
			// UNCHANGED resources aren't deployed, so its depth
			// can't be the deploy depth.
			if (nameToState[name] === "UNCHANGED") {
				continue;
			}

			// If resource is first to make it this far set deploy
			// depth so it can be used for comparison in future loops.
			if (isFirstResourceToProcess) {
				res[group] = nameToDepth[name];
				deployDepth = nameToDepth[name];
				isFirstResourceToProcess = false;
				continue;
			}

			// Update deploy depth if resource's depth is greater than
			// the comparative deploy depth.
			if (nameToDepth[name] > deployDepth) {
				res[group] = nameToDepth[name];
				deployDepth = nameToDepth[name];
			}
		}
	}

	return res;
}

export type ResourcesWithUp = Resources & {
	upResources: UpResources;
	nameToState: ResourceNameToState;
	nameToDeployState: ResourceNameToDeployState;
	groupToHighestDeployDepth: GroupToHighestDeployDepth;
	groupsWithStateChanges: GroupsWithStateChanges;
};

async function initWithUp(
	containerDirPath: ResourceContainerDirPath,
	upJsonPath: string,
): Promise<ResourcesWithUp> {
	const upResources = await setUpResources(upJsonPath);

	const resources = await factory(containerDirPath, {
		upResources,
	});

	const nameToState = setNameToState(
		resources.nameToConfig,
		resources.nameToDependencies,
		upResources,
	);

	const groupsWithStateChanges = setGroupsWithStateChanges(
		nameToState,
		resources.nameToGroup,
	);

	const groupToHighestDeployDepth = setGroupToHighestDeployDepth(
		groupsWithStateChanges,
		resources.groupToNames,
		nameToState,
		resources.nameToDepth,
	);

	return {
		...resources,
		upResources,
		nameToState,
		nameToDeployState: { ...nameToState },
		groupToHighestDeployDepth,
		groupsWithStateChanges,
	};
}

export async function setResourcesWithUp(
	containerDirPath: ResourceContainerDirPath,
	upJsonPath: string,
): Promise<ResourcesWithUp> {
	return await initWithUp(containerDirPath, upJsonPath);
}

//
// Up resource helpers.
//

export function setPostDeployUpResources(
	preDeployUpResources: UpResources,
	nameToConfig: ResourceNameToConfig,
	nameToDependencies: ResourceNameToDependencies,
	nameToUpOutput: ResourceNameToUpOutput,
	turboSummary: TurboSummary,
): UpResources {
	const newUpResources: UpResources = {};
	for (const name in nameToUpOutput) {
		newUpResources[name] = {
			config: nameToConfig[name],
			dependencies: nameToDependencies[name],
			output: nameToUpOutput[name],
		};
	}

	return deepMergeObjects<UpResources>(preDeployUpResources, newUpResources);
}
