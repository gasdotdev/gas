import { exec as execCallback } from "node:child_process";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";
import { confirm, input, select } from "@inquirer/prompts";
import { downloadTemplate } from "giget";
import { loadFile, writeFile } from "magicast";
import { type Config, setConfig } from "../modules/config.js";
import {
	type ResourceTemplateType,
	type ResourceTemplates,
	setResourceTemplates,
} from "../modules/resource-templates.js";
import {
	type Resource,
	type ResourceList,
	type Resources,
	setResource,
	setResourceCamelCaseName,
	setResourceEntities,
	setResourceEntityGroups,
	setResourceKebabCaseName,
	setResourceUpperSnakeCaseName,
	setResources,
} from "../modules/resources.js";

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

async function newGraph(
	config: Config,
	resources: Resources,
	resourceTemplates: ResourceTemplates,
) {
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
	}

	const entryResource = setResource({
		entityGroup: entryResourceEntityGroup,
		entity: entryResourceEntity,
		cloud: entryResourceTemplate.cloud,
		cloudService: entryResourceTemplate.cloudService,
		descriptor: entryResourceTemplate.descriptor,
	});

	let apiResource: Resource | undefined = undefined;

	if (apiResourceTemplate) {
		apiResource = setResource({
			entityGroup: apiResourceEntityGroup,
			entity: apiResourceEntity,
			cloud: apiResourceTemplate.cloud,
			cloudService: apiResourceTemplate.cloudService,
			descriptor: apiResourceTemplate.descriptor,
		});
	}

	let dbResource: Resource | undefined = undefined;

	if (dbResourceTemplate) {
		dbResource = setResource({
			entityGroup: dbResourceEntityGroup,
			entity: dbResourceEntity,
			cloud: dbResourceTemplate.cloud,
			cloudService: dbResourceTemplate.cloudService,
			descriptor: dbResourceTemplate.descriptor,
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

	const processResource = async (resource: Resource, templateId: string) => {
		const resourceKebabCaseName = setResourceKebabCaseName(resource);
		const templateDestinationDir = join(
			config.containerDirPath,
			resourceKebabCaseName,
		);

		await fs.cp(join(templateDir, templateId), templateDestinationDir, {
			recursive: true,
		});

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
			// biome-ignore lint/style/useTemplate: <explanation>
			[
				"index",
				resource.entityGroup,
				resource.entity,
				resource.cloud,
				resource.cloudService,
				resource.descriptor,
			].join(".") + ".ts";

		const newFilePath = join(templateDestinationDir, "src", newFileName);
		await fs.rename(oldFilePath, newFilePath);

		const mod = await loadFile(newFilePath);
		const ast = mod.exports.$ast;

		mod.exports.entityGroupEntityCloudCloudServiceDescriptor.$args[0].name =
			setResourceUpperSnakeCaseName(resource);

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
				setResourceCamelCaseName(resource);
		} else {
			console.log("export config const not found in the file");
		}

		await writeFile(mod, newFilePath);
	};

	const resourceProcessingPromises = [
		processResource(entryResource, entryResourceTemplateId),
		apiResource && apiResourceTemplateId
			? processResource(apiResource, apiResourceTemplateId)
			: null,
		dbResource && dbResourceTemplateId
			? processResource(dbResource, dbResourceTemplateId)
			: null,
	].filter(Boolean);

	await Promise.all(resourceProcessingPromises);

	if (
		entryResourceTemplate.type === "web" &&
		entryResourceTemplate.cloud === "cf" &&
		entryResourceTemplate.cloudService === "pages"
	) {
		const viteConfigFilePath = join(
			config.containerDirPath,
			setResourceKebabCaseName(entryResource),
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
