import { exec as execCallback } from "node:child_process";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";
import { confirm, input, select } from "@inquirer/prompts";
import { downloadTemplate } from "giget";
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
	setObjAsUpperSnakeCaseStr,
	setUpperCaseSnakeAsCamelStr,
	setUpperSnakeCaseAsKebabStr,
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

type PendingResource = {
	entityGroup: string;
	entity: string;
	cloud: string;
	cloudService: string;
	descriptor: string;
	templateId: string;
};

type PendingResources = {
	[name: string]: PendingResource;
};

function setPendingResource(input: {
	entityGroup: string;
	entity: string;
	cloud: string;
	cloudService: string;
	descriptor: string;
	templateId: string;
}): PendingResource {
	return {
		entityGroup: input.entityGroup,
		entity: input.entity,
		cloud: input.cloud,
		cloudService: input.cloudService,
		descriptor: input.descriptor,
		templateId: input.templateId,
	};
}

async function newGraph(
	config: Config,
	resources: Resources,
	resourceTemplates: ResourceTemplates,
) {
	const pendingResources: PendingResources = {};

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

	const entryResourceName = setObjAsUpperSnakeCaseStr({
		entityGroup: entryResourceEntityGroup,
		entity: entryResourceEntity,
		cloud: entryResourceTemplate.cloud,
		cloudService: entryResourceTemplate.cloudService,
		descriptor: entryResourceTemplate.descriptor,
	});

	pendingResources[entryResourceName] = setPendingResource({
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

	if (apiResourceEntityGroup) {
		apiResourceEntity = await runSelectApiEntityPrompt(resources.list);

		if (apiResourceEntity === "new") {
			apiResourceEntity = await runInputApiEntityPrompt();
		}

		const apiResourceName = setObjAsUpperSnakeCaseStr({
			entityGroup: apiResourceEntityGroup,
			entity: apiResourceEntity,
			cloud: apiResourceTemplate!.cloud,
			cloudService: apiResourceTemplate!.cloudService,
			descriptor: apiResourceTemplate!.descriptor,
		});

		pendingResources[apiResourceName] = setPendingResource({
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

	if (dbResourceEntityGroup) {
		dbResourceEntity = await runInputEntityPrompt();

		const dbResourceName = setObjAsUpperSnakeCaseStr({
			entityGroup: dbResourceEntityGroup,
			entity: dbResourceEntity,
			cloud: dbResourceTemplate!.cloud,
			cloudService: dbResourceTemplate!.cloudService,
			descriptor: dbResourceTemplate!.descriptor,
		});

		pendingResources[dbResourceName] = setPendingResource({
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

	const templateSrc = "github:gasdotdev/gas/templates#master";
	const templateDir = join(__dirname, "..", "..", ".giget");

	await downloadTemplate(templateSrc, {
		dir: templateDir,
		forceClean: true,
	});

	const processResource = async (
		pendingResourceName: string,
		pendingResource: PendingResource,
	) => {
		const resourceKebabCaseName =
			setUpperSnakeCaseAsKebabStr(pendingResourceName);
		const templateDestinationDir = join(
			config.containerDirPath,
			resourceKebabCaseName,
		);

		await fs.cp(
			join(templateDir, pendingResource.templateId),
			templateDestinationDir,
			{
				recursive: true,
			},
		);

		const packageJsonPath = join(templateDestinationDir, "package.json");
		const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(packageJsonContent);
		packageJson.name = resourceKebabCaseName;
		await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

		const oldFilePath = join(
			templateDestinationDir,
			"src",
			"index.entity-group.entity.cloud.cloud-service.descriptor.ts",
		);

		const newFileName =
			[
				"index",
				pendingResource.entityGroup,
				pendingResource.entity,
				pendingResource.cloud,
				pendingResource.cloudService,
				pendingResource.descriptor,
			].join(".") + ".ts";

		const newFilePath = join(templateDestinationDir, "src", newFileName);
		await fs.rename(oldFilePath, newFilePath);

		const mod = await loadFile(newFilePath);
		const ast = mod.exports.$ast;

		mod.exports.entityGroupEntityCloudCloudServiceDescriptor.$args[0].name =
			setUpperSnakeCaseAsKebabStr(pendingResourceName);

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
				pendingResourceName;
		} else {
			console.log("export config const not found in the file");
		}

		await writeFile(mod, newFilePath);
	};

	const processPendingResourcesPromises = Object.entries(pendingResources).map(
		([name, pendingResource]) => processResource(name, pendingResource),
	);

	await Promise.all(processPendingResourcesPromises);

	if (
		entryResourceTemplate.type === "web" &&
		entryResourceTemplate.cloud === "cf" &&
		entryResourceTemplate.cloudService === "pages"
	) {
		const viteConfigFilePath = join(
			config.containerDirPath,
			setUpperSnakeCaseAsKebabStr(entryResourceName),
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
		pendingResources[entryResourceName].cloud === "cf" &&
		pendingResources[entryResourceName].cloudService === "pages" &&
		pendingResources[entryResourceName].descriptor === "ssr" &&
		apiResourceTemplateId
	) {
		const apiResourceName = Object.keys(pendingResources)[1];
		resourceNpmInstallCommands.push(
			`npm install --no-fund --no-audit ${setUpperSnakeCaseAsKebabStr(apiResourceName)}@0.0.0 --save-exact -w ${setUpperSnakeCaseAsKebabStr(entryResourceName)}`,
		);
	}

	if (
		pendingResources[entryResourceName].cloud === "cf" &&
		pendingResources[entryResourceName].cloudService === "workers" &&
		pendingResources[entryResourceName].descriptor === "api" &&
		dbResourceTemplateId
	) {
		const dbResourceName = Object.keys(pendingResources)[2];
		resourceNpmInstallCommands.push(
			`npm install --no-fund --no-audit ${setUpperSnakeCaseAsKebabStr(dbResourceName)}@0.0.0 --save-exact -w ${setUpperSnakeCaseAsKebabStr(entryResourceName)}`,
		);
	}

	if (apiResourceTemplateId && dbResourceTemplateId) {
		const dbResourceName = Object.keys(pendingResources)[2];
		resourceNpmInstallCommands.push(
			`npm install --no-fund --no-audit ${setUpperSnakeCaseAsKebabStr(dbResourceName)}@0.0.0 --save-exact -w ${setUpperSnakeCaseAsKebabStr(entryResourceName)}`,
		);
	}

	await installingResources(resourceNpmInstallCommands);

	const addedResources = await setResources(config.containerDirPath, {
		resourceNames: Object.keys(pendingResources),
	});

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	const updateResourceIndexFilePromises: any = [];

	async function updateResourceIndexFile(
		resourceName: string,
		resourceDeps: string[],
	) {
		const mod = await loadFile(
			addedResources.nameToIndexFilePath[resourceName],
		);

		for (const depName of resourceDeps) {
			mod.imports.$append({
				from: setUpperSnakeCaseAsKebabStr(depName),
				imported: setUpperCaseSnakeAsCamelStr(depName),
			});

			const params =
				mod.exports[setUpperCaseSnakeAsCamelStr(resourceName)].$args[0];

			if (!params.services) {
				params.services = [];
				params.services.push({
					binding: builders.raw(`${setUpperCaseSnakeAsCamelStr(depName)}.name`),
				});
			}
		}

		writeFile(mod, addedResources.nameToIndexFilePath[resourceName]);
	}

	for (const name in addedResources.nameToDeps) {
		updateResourceIndexFilePromises.push(
			updateResourceIndexFile(name, addedResources.nameToDeps[name]),
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
