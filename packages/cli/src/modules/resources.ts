import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { Graph, type GraphGroupToDepthToNodes } from "./graph.js";

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

export type ResourcePackageJsonNameToName = Record<string, string>;

export type ResourceNameToDeps = Record<string, string[]>;

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
	packageJsonNameToName: ResourcePackageJsonNameToName;
	nameToDeps: ResourceNameToDeps;
	nameToIndexFilePath: ResourceNameToIndexFilePath;
	nameToBuildIndexFilePath: ResourceNameToBuildIndexFilePath;
	nameToIndexFileContent: ResourceNameToIndexFileContent;
	nameToConfigData: ResourceNameToConfigData;
	nodeJsConfigScript: ResourceNodeJsConfigScript;
	runNodeJsConfigScriptResult: ResourceRunNodeJsConfigScriptResult;
	nameToConfig: ResourceNameToConfig;
};

interface ConfigData {
	variableName: string;
	functionName: string;
	exportString: string;
}

export async function setResources(
	containerDirPath: ResourceContainerDirPath,
): Promise<Resources> {
	const containerSubdirPaths = await setContainerSubdirPaths(containerDirPath);
	const list = setList(containerSubdirPaths);
	const nameToPackageJson = await setNameToPackageJson(containerSubdirPaths);
	const packageJsonNameToName = setPackageJsonNameToName(nameToPackageJson);
	const nameToDeps = setNameToDeps(nameToPackageJson, packageJsonNameToName);
	const nameToIndexFilePath =
		await setNameToIndexFilePath(containerSubdirPaths);
	const nameToIndexFileContent =
		await setNameToIndexFileContent(nameToIndexFilePath);
	const nameToConfigData = setNameToConfigData(nameToIndexFileContent);
	const nameToBuildIndexFilePath = setNameToBuildIndexFilePath(
		containerDirPath,
		nameToIndexFilePath,
	);

	const graph = Graph.new(nameToDeps);
	const nodeJsConfigScript = setNodeJsConfigScript(
		nameToConfigData,
		graph.groupToDepthToNodes,
	);
	const runNodeJsConfigScriptResult =
		await runNodeJsConfigScript(nodeJsConfigScript);
	const nameToConfig = setNameToConfig(runNodeJsConfigScriptResult);

	return {
		containerDirPath,
		containerSubdirPaths,
		list,
		nameToPackageJson,
		packageJsonNameToName,
		nameToDeps,
		nameToIndexFilePath,
		nameToBuildIndexFilePath,
		nameToIndexFileContent,
		nameToConfigData,
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
	const nameToPackageJson: ResourceNameToPackageJson = {};

	for (const subdirPath of containerSubdirPaths) {
		const resourceName = convertContainerSubdirPathToName(subdirPath);
		const packageJsonPath = path.join(subdirPath, "package.json");

		try {
			const data = await fs.readFile(packageJsonPath, "utf8");
			const packageJson: PackageJson = JSON.parse(data);
			nameToPackageJson[resourceName] = packageJson;
		} catch (err) {
			throw new Error(`Unable to read or parse ${packageJsonPath}: ${err}`);
		}
	}

	return nameToPackageJson;
}

function setPackageJsonNameToName(
	nameToPackageJson: ResourceNameToPackageJson,
): ResourcePackageJsonNameToName {
	const packageJsonNameToName: ResourcePackageJsonNameToName = {};
	for (const [resourceName, packageJson] of Object.entries(nameToPackageJson)) {
		const name = packageJson.name as string;
		packageJsonNameToName[name] = resourceName;
	}
	return packageJsonNameToName;
}

function setNameToDeps(
	nameToPackageJson: ResourceNameToPackageJson,
	packageJsonNameToName: ResourcePackageJsonNameToName,
): ResourceNameToDeps {
	const nameToDeps: ResourceNameToDeps = {};
	for (const [name, packageJson] of Object.entries(nameToPackageJson)) {
		const deps: string[] = [];
		const dependencies = packageJson.dependencies as
			| Record<string, string>
			| undefined;
		if (dependencies) {
			for (const dep in dependencies) {
				const internalDep = packageJsonNameToName[dep];
				if (internalDep) {
					deps.push(internalDep);
				}
			}
		}
		nameToDeps[name] = deps;
	}
	return nameToDeps;
}

async function setNameToIndexFilePath(
	containerSubdirPaths: ResourceContainerSubdirPaths,
): Promise<ResourceNameToIndexFilePath> {
	const nameToIndexFilePath: ResourceNameToIndexFilePath = {};
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
					nameToIndexFilePath[resourceName] = path.join(srcPath, file);
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

	return nameToIndexFilePath;
}

function setNameToBuildIndexFilePath(
	containerDirPath: ResourceContainerDirPath,
	nameToIndexFilePath: ResourceNameToIndexFilePath,
): ResourceNameToBuildIndexFilePath {
	const nameToBuildIndexFilePath: ResourceNameToBuildIndexFilePath = {};
	for (const [name, indexFilePath] of Object.entries(nameToIndexFilePath)) {
		const relativePath = path.relative(containerDirPath, indexFilePath);
		const parts = relativePath.split(path.sep);
		parts.splice(1, 0, "build");
		const buildPath = path.join(containerDirPath, ...parts);
		nameToBuildIndexFilePath[name] = buildPath.replace(/\.ts$/, ".js");
	}
	return nameToBuildIndexFilePath;
}

async function setNameToIndexFileContent(
	nameToIndexFilePath: ResourceNameToIndexFilePath,
): Promise<ResourceNameToIndexFileContent> {
	const nameToIndexFileContent: ResourceNameToIndexFileContent = {};
	for (const [name, indexFilePath] of Object.entries(nameToIndexFilePath)) {
		try {
			const content = await fs.readFile(indexFilePath, "utf8");
			nameToIndexFileContent[name] = content;
		} catch (err) {
			throw new Error(
				`Unable to read file ${indexFilePath}: ${(err as Error).message}`,
			);
		}
	}
	return nameToIndexFileContent;
}

function setNameToConfigData(
	nameToIndexFileContent: ResourceNameToIndexFileContent,
): ResourceNameToConfigData {
	const nameToConfigData: ResourceNameToConfigData = {};
	for (const [name, indexFileContent] of Object.entries(
		nameToIndexFileContent,
	)) {
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

				nameToConfigData[name] = {
					variableName: variableNameMatch[1],
					functionName: possibleExportedConfigFunctionName,
					exportString: possibleExportedConfig,
				};
				break;
			}
		}
	}
	return nameToConfigData;
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
	for (const [name, configData] of Object.entries(nameToConfigData)) {
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

export function getNameToConfig(
	resources: Resources,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
): Record<string, any> {
	return { ...resources.nameToConfig };
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

export function setResourceCamelCaseName(resource: Resource): string {
	return [
		resource.entityGroup,
		resource.entity,
		resource.cloud,
		resource.cloudService,
		resource.descriptor,
	]
		.map((part, index) =>
			index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
		)
		.join("");
}

export function setResourceKebabCaseName(resource: Resource): string {
	return `${resource.entityGroup}-${resource.entity}-${resource.cloud}-${resource.cloudService}-${resource.descriptor}`;
}

export function setResourceUpperSnakeCaseName(resource: Resource): string {
	return [
		resource.entityGroup,
		resource.entity,
		resource.cloud,
		resource.cloudService,
		resource.descriptor,
	]
		.map((part) => part.toUpperCase())
		.join("_");
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
