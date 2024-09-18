import { exec as execCallback } from "node:child_process";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";
import { confirm, input, select } from "@inquirer/prompts";
import { downloadTemplate } from "giget";
import { loadFile, writeFile } from "magicast";
import { Config } from "../modules/config.js";
import {
	type ResourceTemplates,
	type ResourceTemplatesSelectPromptListItems,
	getResourceTemplateSelectPromptListItems,
	setResourceTemplates,
} from "../modules/resource-templates.js";
import {
	type Resource,
	type ResourceEntityGroups,
	type ResourceEntityNames,
	Resources,
	setResource,
	setResourceCamelCaseName,
	setResourceKebabCaseName,
	setResourceUpperSnakeCaseName,
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

async function runSelectEntryResourcePrompt(
	resourceTemplatesSelectPromptListItems: ResourceTemplatesSelectPromptListItems,
) {
	return await select({
		message: "Select entry resource:",
		choices: resourceTemplatesSelectPromptListItems,
	});
}

async function runSelectApiResourcePrompt(
	resourceTemplatesSelectPromptListItems: ResourceTemplatesSelectPromptListItems,
) {
	return await select({
		message: "Select API resource:",
		choices: [
			{ name: "Skip", value: "" },
			...resourceTemplatesSelectPromptListItems,
		],
	});
}

async function runSelectApiEntityGroupPrompt(
	resourceEntityGroups: ResourceEntityGroups,
) {
	const choices = [];

	const nonWebEntityGroups = resourceEntityGroups
		.filter((group) => group !== "web")
		.map((group) => ({ name: group, value: group }));

	if (nonWebEntityGroups.length > 0) {
		choices.push(...nonWebEntityGroups);
		choices.push({ name: "create new", value: "new" });
	} else {
		choices.push({
			name: "core (suggested)",
			value: "core",
		});
		choices.push({ name: "create new", value: "new" });
	}

	return await select({
		message: "Select API entity group:",
		choices,
	});
}

async function runSelectApiEntityPrompt(
	resourceEntityNames: ResourceEntityNames,
) {
	const choices = [];

	const entities = resourceEntityNames.map((entity) => ({
		name: entity,
		value: entity,
	}));

	if (entities.length > 0) {
		choices.push(...entities);
		choices.push({ name: "create new", value: "new" });
	} else {
		choices.push({ name: "base (suggested)", value: "base" });
		choices.push({ name: "create new", value: "new" });
	}

	return await select({
		message: "Select API entity:",
		choices,
	});
}

async function runSelectDbResourcePrompt(
	resourceTemplatesSelectPromptListItems: ResourceTemplatesSelectPromptListItems,
) {
	return await select({
		message: "Select DB resource:",
		choices: [
			{ name: "Skip", value: "" },
			...resourceTemplatesSelectPromptListItems,
		],
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
		message: "Entity: (e.g. app, dash, landing)",
		required: true,
	});
}

async function runTestLoadPrompt() {
	return await input({
		message: "test",
		required: true,
		validate: () => {
			return new Promise((resolve) => {
				setTimeout(() => {
					resolve(true);
				}, 1000);
			});
		},
	});
}

async function runSelectAnyResourcePrompt() {
	return await select({
		message: "Select resource",
		choices: [
			{ name: "Cloudflare Pages + Remix", value: "cloudflare-pages-remix" },
		],
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
	const entryResourceTemplateId = await runSelectEntryResourcePrompt(
		getResourceTemplateSelectPromptListItems(resourceTemplates, ["api", "web"]),
	);

	const entryResourceTemplate = resourceTemplates[entryResourceTemplateId];

	let entryResourceEntityGroup = "";
	if (entryResourceTemplate.type === "web") {
		entryResourceEntityGroup = "web";
	} else if (entryResourceTemplate.type === "api") {
		entryResourceEntityGroup = await runSelectApiEntityGroupPrompt(
			resources.entities.groups,
		);

		if (entryResourceEntityGroup === "new") {
			entryResourceEntityGroup = await runInputEntityGroupPrompt();
		}
	}

	entryResourceEntityGroup === "web" &&
		console.log("✔ Entity group set to web");

	const entryResourceEntity = await runInputEntityPrompt();

	let apiResourceTemplateId = "";
	if (entryResourceTemplate.type === "web") {
		apiResourceTemplateId = await runSelectApiResourcePrompt(
			getResourceTemplateSelectPromptListItems(resourceTemplates, ["api"]),
		);
	}

	const apiResourceTemplate = apiResourceTemplateId
		? resourceTemplates[apiResourceTemplateId]
		: undefined;

	let apiResourceEntityGroup = "";
	if (apiResourceTemplateId) {
		apiResourceEntityGroup = await runSelectApiEntityGroupPrompt(
			resources.entities.groups,
		);

		if (apiResourceEntityGroup === "new") {
			apiResourceEntityGroup = await runInputEntityGroupPrompt();
		}
	}

	let apiResourceEntity = "";
	if (apiResourceEntityGroup) {
		apiResourceEntity = await runSelectApiEntityPrompt(
			resources.entities.names,
		);

		if (apiResourceEntity === "new") {
			apiResourceEntity = await runInputEntityPrompt();
		}
	}

	let dbResourceTemplateId = "";
	if (apiResourceTemplateId) {
		dbResourceTemplateId = await runSelectDbResourcePrompt(
			getResourceTemplateSelectPromptListItems(resourceTemplates, ["db"]),
		);
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

	const config = await Config.new();

	const resources = await Resources.new(config.containerDirPath);

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
