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
	kebabCase: string;
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
}): AddedResource {
	return {
		entityGroup: input.entityGroup,
		entity: input.entity,
		cloud: input.cloud,
		cloudService: input.cloudService,
		descriptor: input.descriptor,
		templateId: input.templateId,
		kebabCase: stringsConvertCapitalSnakeCaseToKebabCase(input.name),
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

async function installingResources(
	resourceNpmInstallCommands: string[],
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

async function newGraph(
	config: Config,
	resources: Resources,
	resourceTemplates: ResourceTemplates,
) {
	const addedResources: AddedResources = {};

	const entryResourceTemplateId =
		await runSelectEntryResourcePrompt(resourceTemplates);

	const entryResourceTemplate = resourceTemplates[entryResourceTemplateId];

	let entryResourceEntityGroup = "";

	if (entryResourceTemplate.type === "web") {
		entryResourceEntityGroup = "web";
	} else if (entryResourceTemplate.type === "api") {
		entryResourceEntityGroup = await runSelectApiEntityGroupPrompt(
			resources.list,
		);

		if (entryResourceEntityGroup === "new") {
			entryResourceEntityGroup = await runInputApiEntityGroupPrompt();
		}
	}

	entryResourceEntityGroup === "web" &&
		console.log("✔ Entity group set to web");

	let entryResourceEntity = "";

	if (entryResourceEntityGroup && entryResourceTemplate.type === "web") {
		entryResourceEntity = await runInputWebEntityPrompt();
	} else if (entryResourceEntityGroup && entryResourceTemplate.type === "api") {
		entryResourceEntity = await runSelectApiEntityPrompt(resources.list);

		if (entryResourceEntity === "new") {
			entryResourceEntity = await runInputApiEntityPrompt();
		}
	}

	const entryResourceName = stringsConvertObjectToCapitalSnakeCase({
		entityGroup: entryResourceEntityGroup,
		entity: entryResourceEntity,
		cloud: entryResourceTemplate.cloud,
		cloudService: entryResourceTemplate.cloudService,
		descriptor: entryResourceTemplate.descriptor,
	});

	addedResources[entryResourceName] = setAddedResource({
		name: entryResourceName,
		entityGroup: entryResourceEntityGroup,
		entity: entryResourceEntity,
		cloud: entryResourceTemplate.cloud,
		cloudService: entryResourceTemplate.cloudService,
		descriptor: entryResourceTemplate.descriptor,
		templateId: entryResourceTemplateId,
	});

	let apiResourceTemplateId = "";
	if (entryResourceTemplate.type === "web") {
		apiResourceTemplateId = await runSelectApiResourcePrompt(resourceTemplates);
	}

	const apiResourceTemplate = apiResourceTemplateId
		? resourceTemplates[apiResourceTemplateId]
		: undefined;

	let apiResourceEntityGroup = "";
	if (apiResourceTemplateId) {
		apiResourceEntityGroup = await runSelectApiEntityGroupPrompt(
			resources.list,
		);

		if (apiResourceEntityGroup === "new") {
			apiResourceEntityGroup = await runInputApiEntityGroupPrompt();
		}
	}

	let apiResourceEntity = "";
	let apiResourceName = "";

	if (apiResourceEntityGroup) {
		apiResourceEntity = await runSelectApiEntityPrompt(resources.list);

		if (apiResourceEntity === "new") {
			apiResourceEntity = await runInputApiEntityPrompt();
		}

		apiResourceName = stringsConvertObjectToCapitalSnakeCase({
			entityGroup: apiResourceEntityGroup,
			entity: apiResourceEntity,
			cloud: apiResourceTemplate!.cloud,
			cloudService: apiResourceTemplate!.cloudService,
			descriptor: apiResourceTemplate!.descriptor,
		});

		addedResources[apiResourceName] = setAddedResource({
			name: apiResourceName,
			entityGroup: apiResourceEntityGroup,
			entity: apiResourceEntity,
			cloud: apiResourceTemplate!.cloud,
			cloudService: apiResourceTemplate!.cloudService,
			descriptor: apiResourceTemplate!.descriptor,
			templateId: apiResourceTemplateId,
		});
	}

	let dbResourceTemplateId = "";

	if (apiResourceTemplateId) {
		dbResourceTemplateId = await runSelectDbResourcePrompt(resourceTemplates);
	}

	const dbResourceTemplate = dbResourceTemplateId
		? resourceTemplates[dbResourceTemplateId]
		: undefined;

	let dbResourceEntityGroup = "";

	if (dbResourceTemplateId) {
		dbResourceEntityGroup = await runInputEntityGroupPrompt();
	}

	let dbResourceEntity = "";
	let dbResourceName = "";
	if (dbResourceEntityGroup) {
		dbResourceEntity = await runInputEntityPrompt();

		dbResourceName = stringsConvertObjectToCapitalSnakeCase({
			entityGroup: dbResourceEntityGroup,
			entity: dbResourceEntity,
			cloud: dbResourceTemplate!.cloud,
			cloudService: dbResourceTemplate!.cloudService,
			descriptor: dbResourceTemplate!.descriptor,
		});

		addedResources[dbResourceName] = setAddedResource({
			name: dbResourceName,
			entityGroup: dbResourceEntityGroup,
			entity: dbResourceEntity,
			cloud: dbResourceTemplate!.cloud,
			cloudService: dbResourceTemplate!.cloudService,
			descriptor: dbResourceTemplate!.descriptor,
			templateId: dbResourceTemplateId,
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

	return;

	if (
		entryResourceTemplate.type === "web" &&
		entryResourceTemplate.cloud === "cf" &&
		entryResourceTemplate.cloudService === "pages"
	) {
		const viteConfigFilePath = join(
			config.containerDirPath,
			stringsConvertCapitalSnakeCaseToKebabCase(entryResourceName),
			"vite.config.ts",
		);

		const viteConfigContent = await fs.readFile(viteConfigFilePath, "utf-8");

		const newEnvVarName = `GAS_${[
			entryResourceEntityGroup,
			entryResourceEntity,
			entryResourceTemplate.cloud,
			entryResourceTemplate.cloudService,
			entryResourceTemplate.descriptor,
		]
			.join("_")
			.toUpperCase()}_PORT`;

		const updatedViteConfigContent = viteConfigContent.replace(
			/process\.env\.VITE_SERVER_PORT/g,
			`process.env.${newEnvVarName}`,
		);

		await fs.writeFile(viteConfigFilePath, updatedViteConfigContent);
	}

	const resourceNpmInstallCommands: string[] = [];

	if (
		addedResources[entryResourceName].cloud === "cf" &&
		addedResources[entryResourceName].cloudService === "pages" &&
		addedResources[entryResourceName].descriptor === "ssr" &&
		apiResourceTemplateId
	) {
		const apiResourceName = Object.keys(addedResources)[1];
		resourceNpmInstallCommands.push(
			`npm install --no-fund --no-audit ${stringsConvertCapitalSnakeCaseToKebabCase(apiResourceName)}@0.0.0 --save-exact -w ${stringsConvertCapitalSnakeCaseToKebabCase(entryResourceName)}`,
		);
	}

	if (
		addedResources[entryResourceName].cloud === "cf" &&
		addedResources[entryResourceName].cloudService === "workers" &&
		addedResources[entryResourceName].descriptor === "api" &&
		dbResourceTemplateId
	) {
		const dbResourceName = Object.keys(addedResources)[2];
		resourceNpmInstallCommands.push(
			`npm install --no-fund --no-audit ${stringsConvertCapitalSnakeCaseToKebabCase(dbResourceName)}@0.0.0 --save-exact -w ${stringsConvertCapitalSnakeCaseToKebabCase(entryResourceName)}`,
		);
	}

	if (apiResourceTemplateId && dbResourceTemplateId) {
		const dbResourceName = Object.keys(addedResources)[2];
		resourceNpmInstallCommands.push(
			`npm install --no-fund --no-audit ${stringsConvertCapitalSnakeCaseToKebabCase(dbResourceName)}@0.0.0 --save-exact -w ${stringsConvertCapitalSnakeCaseToKebabCase(entryResourceName)}`,
		);
	}

	await installingResources(resourceNpmInstallCommands);

	const newResources = await setResources(config.containerDirPath, {
		resourceNames: Object.keys(addedResources),
	});

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const updateResourceIndexFilePromises: any = [];

	async function updateResourceIndexFile(
		resourceName: string,
		resourceDeps: string[],
	) {
		const mod = await loadFile(newResources.nameToIndexFilePath[resourceName]);

		for (const depName of resourceDeps) {
			mod.imports.$append({
				from: stringsConvertCapitalSnakeCaseToKebabCase(depName),
				imported: stringsConvertCapitalSnakeCaseToCamelCase(depName),
			});

			const params =
				mod.exports[stringsConvertCapitalSnakeCaseToCamelCase(resourceName)]
					.$args[0];

			if (
				addedResources[resourceName].cloud === "cf" &&
				addedResources[resourceName].cloudService === "pages" &&
				addedResources[resourceName].descriptor === "ssr" &&
				apiResourceName
			) {
				if (!params.services) {
					params.services = [];
					params.services.push({
						binding: builders.raw(
							`${stringsConvertCapitalSnakeCaseToCamelCase(depName)}.name`,
						),
					});
				}
			}
		}

		writeFile(mod, newResources.nameToIndexFilePath[resourceName]);
	}

	for (const name in newResources.nameToDeps) {
		updateResourceIndexFilePromises.push(
			updateResourceIndexFile(name, newResources.nameToDeps[name]),
		);
	}

	await Promise.all(updateResourceIndexFilePromises);

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
