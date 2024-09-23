import { exec as execCallback } from "node:child_process";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";
import { confirm, input, select } from "@inquirer/prompts";
import { downloadTemplate as giget } from "giget";
import { builders, loadFile, writeFile } from "magicast";
import { type Config, setConfig } from "../modules/config.js";
import {
	type ResourceTemplateType,
	type ResourceTemplates,
	setResourceTemplates,
} from "../modules/resource-templates.js";
import {
	type ResourceList,
	type Resources,
	setResourceEntities,
	setResourceEntityGroups,
	setResources,
} from "../modules/resources.js";
import {
	stringsConvertCapitalSnakeCaseToCamelCase,
	stringsConvertCapitalSnakeCaseToDotCase,
	stringsConvertCapitalSnakeCaseToKebabCase,
	stringsConvertObjectToCapitalSnakeCase,
} from "../modules/strings.js";

type State = "select-which" | "new-graph" | "existing-graph";

async function runSelectWhichPrompt() {
	return await select({
		message: "Add resource(s):",
		choices: [
			{ name: "Build new graph", value: "graph" },
			{ name: "Add to existing graph", value: "existing" },
		],
	});
}

export type ResourceTemplatesSelectPromptListItems = {
	name: string;
	value: string;
}[];

export const setResourceTemplateSelectPromptListItems = (
	record: ResourceTemplates,
	types?: ResourceTemplateType[],
): ResourceTemplatesSelectPromptListItems => {
	const entries = Object.entries(record);
	return types
		? entries
				.filter(([_, value]) => types.includes(value.type))
				.map(([key, value]) => ({ name: value.name, value: key }))
		: entries.map(([key, value]) => ({ name: value.name, value: key }));
};

async function runSelectEntryResourcePrompt(
	resourceTemplates: ResourceTemplates,
) {
	const choices = setResourceTemplateSelectPromptListItems(resourceTemplates, [
		"api",
		"web",
	]);

	return await select({
		message: "Select entry resource:",
		choices,
	});
}

async function runSelectApiEntityGroupPrompt(resourceList: ResourceList) {
	const choices: { name: string; value: string }[] = [];

	const apiResourceEntityGroups = setResourceEntityGroups(resourceList, [
		"api",
	]);

	const apiResourceEntityGroupChoices = apiResourceEntityGroups.map(
		(group) => ({
			name: group,
			value: group,
		}),
	);

	if (apiResourceEntityGroupChoices.length > 0) {
		choices.push(...apiResourceEntityGroupChoices);
		choices.push({ name: "Create new", value: "new" });
	} else {
		choices.push({
			name: "Core (suggested)",
			value: "core",
		});
		choices.push({ name: "Create new", value: "new" });
	}

	return await select({
		message: "Select API entity group:",
		choices,
	});
}

async function runInputApiEntityGroupPrompt() {
	return await input({
		message: "Enter API entity group:",
		required: true,
	});
}

async function runInputWebEntityPrompt() {
	return await input({
		message: "Enter web resource entity: (e.g. app, dash, landing)",
		required: true,
	});
}

async function runSelectApiEntityPrompt(resourceList: ResourceList) {
	const choices = [];

	const resourceEntities = setResourceEntities(resourceList, ["api"]);

	const entityChoices = resourceEntities.map((entity) => ({
		name: entity,
		value: entity,
	}));

	if (entityChoices.length > 0) {
		choices.push(...entityChoices);
		choices.push({ name: "Create new", value: "new" });
	} else {
		choices.push({ name: "Base (suggested)", value: "base" });
		choices.push({ name: "Create new", value: "new" });
	}

	return await select({
		message: "Select API entity:",
		choices,
	});
}

async function runInputApiEntityPrompt() {
	return await input({
		message: "Enter API entity:",
		required: true,
	});
}

async function runSelectApiResourcePrompt(
	resourceTemplates: ResourceTemplates,
) {
	const resourceTemplatesSelectPromptListItems =
		setResourceTemplateSelectPromptListItems(resourceTemplates, ["api"]);

	const choices = [
		{ name: "Skip", value: "" },
		...resourceTemplatesSelectPromptListItems,
	];

	return await select({
		message: "Select API resource:",
		choices,
	});
}

async function runSelectDbResourcePrompt(resourceTemplates: ResourceTemplates) {
	const resourceTemplatesSelectPromptListItems =
		setResourceTemplateSelectPromptListItems(resourceTemplates, ["db"]);

	const choices = [
		{ name: "Skip", value: "" },
		...resourceTemplatesSelectPromptListItems,
	];

	return await select({
		message: "Select DB resource:",
		choices,
	});
}

async function runInputEntityGroupPrompt() {
	return await input({
		message: "Entity group:",
		required: true,
	});
}

async function runInputEntityPrompt() {
	return await input({
		message: "Entity:",
		required: true,
	});
}

type AddedResource = {
	entityGroup: string;
	entity: string;
	cloud: string;
	cloudService: string;
	descriptor: string;
	templateId: string;
	camelCase: string;
	kebabCase: string;
	indexFilePath: string;
};

type AddedResources = {
	[name: string]: AddedResource;
};

function setAddedResource(input: {
	name: string;
	entityGroup: string;
	entity: string;
	cloud: string;
	cloudService: string;
	descriptor: string;
	templateId: string;
	resourceContainerDir: string;
}): AddedResource {
	const kebabCase = stringsConvertCapitalSnakeCaseToKebabCase(input.name);
	return {
		entityGroup: input.entityGroup,
		entity: input.entity,
		cloud: input.cloud,
		cloudService: input.cloudService,
		descriptor: input.descriptor,
		templateId: input.templateId,
		camelCase: stringsConvertCapitalSnakeCaseToCamelCase(input.name),
		kebabCase,
		indexFilePath: join(
			input.resourceContainerDir,
			kebabCase,
			"src",
			`index.${stringsConvertCapitalSnakeCaseToDotCase(input.name)}.ts`,
		),
	};
}

type GigetTemplateToCopy = {
	src: string;
	dest: string;
};

function setAddedResourceTemplatesToCopy(
	addedResources: AddedResources,
	resourceContainerDirPath: string,
	gigetLocalPath: string,
): GigetTemplateToCopy[] {
	const res: GigetTemplateToCopy[] = [];
	for (const addedResourceName in addedResources) {
		const addedResource = addedResources[addedResourceName];
		const templateDestinationDir = join(
			resourceContainerDirPath,
			addedResource.kebabCase,
		);
		res.push({
			src: join(gigetLocalPath, addedResource.templateId),
			dest: templateDestinationDir,
		});
	}
	return res;
}

async function copyAddedResourceTemplatesFromGigetLocalSrc(
	addedResourceTemplatesToCopy: GigetTemplateToCopy[],
) {
	const promises: Promise<void>[] = [];
	for (const addedResourceTemplateToCopy of addedResourceTemplatesToCopy) {
		promises.push(
			fs.cp(addedResourceTemplateToCopy.src, addedResourceTemplateToCopy.dest, {
				recursive: true,
			}),
		);
	}
	await Promise.all(promises);
}

type AddedResourcePackageJsonPaths = {
	[name: string]: string;
};

function setAddedResourcePackageJsonPaths(
	addedResources: AddedResources,
	resourceContainerDirPath: string,
) {
	const res: AddedResourcePackageJsonPaths = {};
	for (const addedResourceName in addedResources) {
		const addedResource = addedResources[addedResourceName];
		const packageJsonPath = join(
			resourceContainerDirPath,
			addedResource.kebabCase,
			"package.json",
		);
		res[addedResourceName] = packageJsonPath;
	}
	return res;
}

type AddedResourcePackageJsons = {
	[name: string]: Record<string, unknown>;
};

async function readAddedResourcePackageJsons(
	addedResourcePackageJsonPaths: AddedResourcePackageJsonPaths,
) {
	const res: AddedResourcePackageJsons = {};
	for (const addedResourceName in addedResourcePackageJsonPaths) {
		const packageJsonPath = addedResourcePackageJsonPaths[addedResourceName];
		const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
		res[addedResourceName] = JSON.parse(packageJsonContent);
	}
	return res;
}

function updateAddedResourcePackageJsonNames(
	addedResourcePackageJsons: AddedResourcePackageJsons,
) {
	for (const addedResourceName in addedResourcePackageJsons) {
		const packageJson = addedResourcePackageJsons[addedResourceName];
		packageJson.name =
			stringsConvertCapitalSnakeCaseToKebabCase(addedResourceName);
	}
}

async function saveAddedResourcePackageJsons(
	addedResourcePackageJsonPaths: AddedResourcePackageJsonPaths,
	addedResourcePackageJsons: AddedResourcePackageJsons,
) {
	const promises: Promise<void>[] = [];
	for (const addedResourceName in addedResourcePackageJsons) {
		const packageJsonPath = addedResourcePackageJsonPaths[addedResourceName];
		promises.push(
			fs.writeFile(
				packageJsonPath,
				JSON.stringify(addedResourcePackageJsons[addedResourceName], null, 2),
			),
		);
	}
	await Promise.all(promises);
}

type AddedResourceIndexFilesToRename = {
	[name: string]: {
		oldPath: string;
		newPath: string;
	};
};

function setAddedResourceIndexFilesToRename(
	addedResources: AddedResources,
	resourceContainerDirPath: string,
) {
	const res: AddedResourceIndexFilesToRename = {};
	for (const addedResourceName in addedResources) {
		const addedResource = addedResources[addedResourceName];

		const oldFilePath = join(
			resourceContainerDirPath,
			addedResource.kebabCase,
			"src",
			"index.entity-group.entity.cloud.cloud-service.descriptor.ts",
		);

		const newFileName =
			[
				"index",
				addedResource.entityGroup,
				addedResource.entity,
				addedResource.cloud,
				addedResource.cloudService,
				addedResource.descriptor,
			].join(".") + ".ts";

		res[addedResourceName] = {
			oldPath: oldFilePath,
			newPath: join(
				resourceContainerDirPath,
				addedResource.kebabCase,
				"src",
				newFileName,
			),
		};
	}
	return res;
}

async function renameAddedResourceIndexFiles(
	addedResourceIndexFilesToRename: AddedResourceIndexFilesToRename,
) {
	const promises: Promise<void>[] = [];
	for (const addedResourceName in addedResourceIndexFilesToRename) {
		const { oldPath, newPath } =
			addedResourceIndexFilesToRename[addedResourceName];
		promises.push(fs.rename(oldPath, newPath));
	}
	await Promise.all(promises);
}

type AddedEntryResourceViteConfigPath = string;

function setAddedEntryResourceViteConfigPath(
	resourceContainerDirPath: string,
	addedEntryResourceName: string,
	addedResources: AddedResources,
): AddedEntryResourceViteConfigPath {
	return join(
		resourceContainerDirPath,
		addedResources[addedEntryResourceName].kebabCase,
		"vite.config.ts",
	);
}

async function updateAddedEntryResourceViteConfigEnvVars(
	addedEntryResourceViteConfigPath: AddedEntryResourceViteConfigPath,
	addedEntryResourceName: string,
	addedResources: AddedResources,
) {
	const viteConfigContent = await fs.readFile(
		addedEntryResourceViteConfigPath,
		"utf-8",
	);

	const newEnvVarName = `GAS_${[
		addedResources[addedEntryResourceName].entityGroup,
		addedResources[addedEntryResourceName].entity,
		addedResources[addedEntryResourceName].cloud,
		addedResources[addedEntryResourceName].cloudService,
		addedResources[addedEntryResourceName].descriptor,
	]
		.join("_")
		.toUpperCase()}_PORT`;

	const updatedViteConfigContent = viteConfigContent.replace(
		/process\.env\.VITE_SERVER_PORT/g,
		`process.env.${newEnvVarName}`,
	);

	await fs.writeFile(
		addedEntryResourceViteConfigPath,
		updatedViteConfigContent,
	);
}

type AddedResourceNpmInstallCommands = string[];

function setAddedResourceNpmInstallCommands(
	addedResources: AddedResources,
	addedEntryResourceName: string,
	addedApiResourceName: string,
	addedDbResourceName: string,
): AddedResourceNpmInstallCommands {
	const res: AddedResourceNpmInstallCommands = [];

	const cmdBase = "npm install --no-fund --no-audit";

	const addedEntryResource = addedResources[addedEntryResourceName];
	const addedApiResource = addedResources[addedApiResourceName];
	const addedDbResource = addedResources[addedDbResourceName];

	if (
		addedEntryResource.cloud === "cf" &&
		addedEntryResource.cloudService === "pages" &&
		addedEntryResource.descriptor === "ssr" &&
		addedApiResourceName
	) {
		res.push(
			`${cmdBase} ${addedApiResource.kebabCase}@0.0.0 --save-exact -w ${addedEntryResource.kebabCase}`,
		);
	}

	if (
		addedEntryResource.cloud === "cf" &&
		addedEntryResource.cloudService === "workers" &&
		addedEntryResource.descriptor === "api" &&
		addedDbResourceName
	) {
		res.push(
			`${cmdBase} ${addedDbResource.kebabCase}@0.0.0 --save-exact -w ${addedEntryResource.kebabCase}`,
		);
	}

	if (addedApiResourceName && addedDbResourceName) {
		res.push(
			`${cmdBase} ${addedDbResource.kebabCase}@0.0.0 --save-exact -w ${addedApiResource.kebabCase}`,
		);
	}

	return res;
}

async function runAddedResourceNpmInstallCommands(
	resourceNpmInstallCommands: AddedResourceNpmInstallCommands,
): Promise<void> {
	console.log("Installing resources...");
	try {
		const installPromises = resourceNpmInstallCommands.map((command) =>
			exec(command),
		);
		const results = await Promise.all(installPromises);

		results.forEach(({ stdout, stderr }, index) => {
			console.log(`Output for command: ${resourceNpmInstallCommands[index]}`);
			console.log(stdout);
			if (stderr) {
				console.error(stderr);
			}
		});

		console.log("All resources installed successfully.");
	} catch (error) {
		console.error("Error installing resources:", error);
	}
}

type AddedResourceDependencies = {
	[name: string]: string[];
};

function setAddedResourceDependencies(
	addedResources: AddedResources,
	addedEntryResourceName: string,
	addedApiResourceName: string,
	addedDbResourceName: string,
): AddedResourceDependencies {
	const res: AddedResourceDependencies = {};

	const addedEntryResource = addedResources[addedEntryResourceName];

	res[addedEntryResourceName] = [];
	if (addedApiResourceName) res[addedApiResourceName] = [];
	if (addedDbResourceName) res[addedDbResourceName] = [];

	if (
		addedEntryResource.cloud === "cf" &&
		addedEntryResource.cloudService === "pages" &&
		addedEntryResource.descriptor === "ssr" &&
		addedApiResourceName
	) {
		res[addedEntryResourceName].push(addedApiResourceName);
	}

	if (
		addedEntryResource.cloud === "cf" &&
		addedEntryResource.cloudService === "workers" &&
		addedEntryResource.descriptor === "api" &&
		addedDbResourceName
	) {
		res[addedEntryResourceName].push(addedDbResourceName);
	}

	if (addedApiResourceName && addedDbResourceName) {
		res[addedApiResourceName].push(addedDbResourceName);
	}

	return res;
}

async function updateAddedResourceIndexFiles(
	addedResources: AddedResources,
	addedResourceDependencies: AddedResourceDependencies,
	addedApiResourceName: string,
) {
	const promises: Promise<void>[] = [];

	for (const addedResourceName in addedResources) {
		const mod = await loadFile(addedResources[addedResourceName].indexFilePath);

		const ast = mod.exports.$ast;

		mod.exports.entityGroupEntityCloudCloudServiceDescriptor.$args[0].name =
			addedResourceName;

		// Note: The ast types aren't working correctly. Thus,
		// @ts-ignore. In a demo, where magicast is used in a
		// plain .js file, and with the same version, ast is
		// correctly typed as having a body method. The reason
		// for this discrepancy is unknown.
		// @ts-ignore
		const exportDeclaration = ast.body.find(
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			(node: any) =>
				node.type === "ExportNamedDeclaration" &&
				node.declaration?.type === "VariableDeclaration" &&
				node.declaration.declarations[0]?.id.type === "Identifier" &&
				node.declaration.declarations[0].id.name ===
					"entityGroupEntityCloudCloudServiceDescriptor",
		);

		if (exportDeclaration?.declaration.declarations[0]) {
			exportDeclaration.declaration.declarations[0].id.name =
				addedResources[addedResourceName].camelCase;
		} else {
			console.log("export config const not found in the file");
		}

		for (const depName of addedResourceDependencies[addedResourceName]) {
			mod.imports.$append({
				from: addedResources[depName].kebabCase,
				imported: addedResources[depName].camelCase,
			});

			const params =
				mod.exports[addedResources[addedResourceName].camelCase].$args[0];

			if (
				addedResources[addedResourceName].cloud === "cf" &&
				addedResources[addedResourceName].cloudService === "pages" &&
				addedResources[addedResourceName].descriptor === "ssr" &&
				addedApiResourceName
			) {
				if (!params.services) {
					params.services = [];
					params.services.push({
						binding: builders.raw(`${addedResources[depName].camelCase}.name`),
					});
				}
			}
		}

		writeFile(mod, addedResources[addedResourceName].indexFilePath);
	}

	return await Promise.all(promises);
}

async function runConfirmInstallPackages() {
	return await confirm({
		message: "Install packages?",
	});
}

const exec = util.promisify(execCallback);

async function installPackages(): Promise<void> {
	console.log("Installing packages...");
	try {
		const { stdout, stderr } = await exec("npm install");
		console.log(stdout);
		if (stderr) {
			console.error(stderr);
		}
		console.log("Packages installed successfully.");
	} catch (error) {
		console.error("Error installing packages:", error);
	}
}

async function newGraph(
	config: Config,
	resources: Resources,
	resourceTemplates: ResourceTemplates,
) {
	const addedResources: AddedResources = {};

	const addedEntryResourceTemplateId =
		await runSelectEntryResourcePrompt(resourceTemplates);

	const addedEntryResourceTemplate =
		resourceTemplates[addedEntryResourceTemplateId];

	let addedEntryResourceEntityGroup = "";

	if (addedEntryResourceTemplate.type === "web") {
		addedEntryResourceEntityGroup = "web";
	} else if (addedEntryResourceTemplate.type === "api") {
		addedEntryResourceEntityGroup = await runSelectApiEntityGroupPrompt(
			resources.list,
		);

		if (addedEntryResourceEntityGroup === "new") {
			addedEntryResourceEntityGroup = await runInputApiEntityGroupPrompt();
		}
	}

	addedEntryResourceEntityGroup === "web" &&
		console.log("✔ Entity group set to web");

	let addedEntryResourceEntity = "";

	if (
		addedEntryResourceEntityGroup &&
		addedEntryResourceTemplate.type === "web"
	) {
		addedEntryResourceEntity = await runInputWebEntityPrompt();
	} else if (
		addedEntryResourceEntityGroup &&
		addedEntryResourceTemplate.type === "api"
	) {
		addedEntryResourceEntity = await runSelectApiEntityPrompt(resources.list);

		if (addedEntryResourceEntity === "new") {
			addedEntryResourceEntity = await runInputApiEntityPrompt();
		}
	}

	const addedEntryResourceName = stringsConvertObjectToCapitalSnakeCase({
		entityGroup: addedEntryResourceEntityGroup,
		entity: addedEntryResourceEntity,
		cloud: addedEntryResourceTemplate.cloud,
		cloudService: addedEntryResourceTemplate.cloudService,
		descriptor: addedEntryResourceTemplate.descriptor,
	});

	addedResources[addedEntryResourceName] = setAddedResource({
		name: addedEntryResourceName,
		entityGroup: addedEntryResourceEntityGroup,
		entity: addedEntryResourceEntity,
		cloud: addedEntryResourceTemplate.cloud,
		cloudService: addedEntryResourceTemplate.cloudService,
		descriptor: addedEntryResourceTemplate.descriptor,
		templateId: addedEntryResourceTemplateId,
		resourceContainerDir: config.containerDirPath,
	});

	let addedApiResourceTemplateId = "";
	if (addedEntryResourceTemplate.type === "web") {
		addedApiResourceTemplateId =
			await runSelectApiResourcePrompt(resourceTemplates);
	}

	const addedApiResourceTemplate = addedApiResourceTemplateId
		? resourceTemplates[addedApiResourceTemplateId]
		: undefined;

	let addedApiResourceEntityGroup = "";
	if (addedApiResourceTemplateId) {
		addedApiResourceEntityGroup = await runSelectApiEntityGroupPrompt(
			resources.list,
		);

		if (addedApiResourceEntityGroup === "new") {
			addedApiResourceEntityGroup = await runInputApiEntityGroupPrompt();
		}
	}

	let addedApiResourceEntity = "";
	let addedApiResourceName = "";

	if (addedApiResourceEntityGroup) {
		addedApiResourceEntity = await runSelectApiEntityPrompt(resources.list);

		if (addedApiResourceEntity === "new") {
			addedApiResourceEntity = await runInputApiEntityPrompt();
		}

		addedApiResourceName = stringsConvertObjectToCapitalSnakeCase({
			entityGroup: addedApiResourceEntityGroup,
			entity: addedApiResourceEntity,
			cloud: addedApiResourceTemplate!.cloud,
			cloudService: addedApiResourceTemplate!.cloudService,
			descriptor: addedApiResourceTemplate!.descriptor,
		});

		addedResources[addedApiResourceName] = setAddedResource({
			name: addedApiResourceName,
			entityGroup: addedApiResourceEntityGroup,
			entity: addedApiResourceEntity,
			cloud: addedApiResourceTemplate!.cloud,
			cloudService: addedApiResourceTemplate!.cloudService,
			descriptor: addedApiResourceTemplate!.descriptor,
			templateId: addedApiResourceTemplateId,
			resourceContainerDir: config.containerDirPath,
		});
	}

	let addedDbResourceTemplateId = "";

	if (addedApiResourceTemplateId) {
		addedDbResourceTemplateId =
			await runSelectDbResourcePrompt(resourceTemplates);
	}

	const addedDbResourceTemplate = addedDbResourceTemplateId
		? resourceTemplates[addedDbResourceTemplateId]
		: undefined;

	let addedDbResourceEntityGroup = "";

	if (addedDbResourceTemplateId) {
		addedDbResourceEntityGroup = await runInputEntityGroupPrompt();
	}

	let addedDbResourceEntity = "";
	let addedDbResourceName = "";

	if (addedDbResourceEntityGroup) {
		addedDbResourceEntity = await runInputEntityPrompt();

		addedDbResourceName = stringsConvertObjectToCapitalSnakeCase({
			entityGroup: addedDbResourceEntityGroup,
			entity: addedDbResourceEntity,
			cloud: addedDbResourceTemplate!.cloud,
			cloudService: addedDbResourceTemplate!.cloudService,
			descriptor: addedDbResourceTemplate!.descriptor,
		});

		addedResources[addedDbResourceName] = setAddedResource({
			name: addedDbResourceName,
			entityGroup: addedDbResourceEntityGroup,
			entity: addedDbResourceEntity,
			cloud: addedDbResourceTemplate!.cloud,
			cloudService: addedDbResourceTemplate!.cloudService,
			descriptor: addedDbResourceTemplate!.descriptor,
			templateId: addedDbResourceTemplateId,
			resourceContainerDir: config.containerDirPath,
		});
	}

	const __filename = fileURLToPath(import.meta.url);

	const __dirname = dirname(__filename);

	const gigetRemotePath = "github:gasdotdev/gas/templates#master";

	const gigetLocalPath = join(__dirname, "..", "..", ".giget");

	await giget(gigetRemotePath, {
		dir: gigetLocalPath,
		forceClean: true,
	});

	const resourceTemplatesToCopy = setAddedResourceTemplatesToCopy(
		addedResources,
		config.containerDirPath,
		gigetLocalPath,
	);

	await copyAddedResourceTemplatesFromGigetLocalSrc(resourceTemplatesToCopy);

	const resourcePackageJsonPaths = setAddedResourcePackageJsonPaths(
		addedResources,
		config.containerDirPath,
	);

	const resourcePackageJsons = await readAddedResourcePackageJsons(
		resourcePackageJsonPaths,
	);

	updateAddedResourcePackageJsonNames(resourcePackageJsons);

	await saveAddedResourcePackageJsons(
		resourcePackageJsonPaths,
		resourcePackageJsons,
	);

	const resourceIndexFilesToRename = setAddedResourceIndexFilesToRename(
		addedResources,
		config.containerDirPath,
	);

	await renameAddedResourceIndexFiles(resourceIndexFilesToRename);

	if (addedEntryResourceTemplateId === "cloudflare-pages-remix") {
		const addedEntryResourceViteConfigPath =
			setAddedEntryResourceViteConfigPath(
				config.containerDirPath,
				addedEntryResourceName,
				addedResources,
			);

		await updateAddedEntryResourceViteConfigEnvVars(
			addedEntryResourceViteConfigPath,
			addedEntryResourceName,
			addedResources,
		);
	}

	const resourceNpmInstallCommands = setAddedResourceNpmInstallCommands(
		addedResources,
		addedEntryResourceName,
		addedApiResourceName,
		addedDbResourceName,
	);

	await runAddedResourceNpmInstallCommands(resourceNpmInstallCommands);

	const addedResourceDependencies = setAddedResourceDependencies(
		addedResources,
		addedEntryResourceName,
		addedApiResourceName,
		addedDbResourceName,
	);

	await updateAddedResourceIndexFiles(
		addedResources,
		addedResourceDependencies,
		addedApiResourceName,
	);

	const confirmInstallPackages = await runConfirmInstallPackages();

	if (confirmInstallPackages) {
		await installPackages();
	}
}

async function existingGraph() {
	//
}

export async function runAdd() {
	let state: State = "select-which";

	const config = await setConfig();

	const resources = await setResources(config.containerDirPath);

	if (Object.keys(resources.nameToConfig).length === 0) {
		state = "new-graph";
	}

	const resourceTemplates = setResourceTemplates();

	const which = await runSelectWhichPrompt();

	state = which === "graph" ? "new-graph" : "existing-graph";

	switch (state) {
		case "new-graph": {
			await newGraph(config, resources, resourceTemplates);
			break;
		}
		case "existing-graph": {
			await existingGraph();
			break;
		}
	}
}
