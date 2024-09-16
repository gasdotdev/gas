import { exec as execCallback } from "node:child_process";
import fs from "node:fs/promises";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";
import { confirm, input, select } from "@inquirer/prompts";
import { downloadTemplate } from "giget";
import { loadFile, writeFile } from "magicast";
import { Config } from "../modules/config.js";
import {
	type ResourceTemplatesSelectPromptListItems,
	getResourceTemplateSelectPromptListItems,
	setResourceTemplates,
} from "../modules/resource-templates.js";
import {
	setResource,
	setResourceCamelCaseName,
	setResourceKebabCaseName,
	setResourceUpperSnakeCaseName,
} from "../modules/resource.js";
import { Resources } from "../modules/resources.js";

type State =
	| "select-which"
	| "add-graph.select-entry-resource"
	| "add-single.select-any-resource";

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
			{ name: "Skip", value: "skip" },
			...resourceTemplatesSelectPromptListItems,
		],
	});
}

async function runSelectDbResourcePrompt(
	resourceTemplatesSelectPromptListItems: ResourceTemplatesSelectPromptListItems,
) {
	return await select({
		message: "Select DB resource:",
		choices: [
			{ name: "Skip", value: "skip" },
			...resourceTemplatesSelectPromptListItems,
		],
	});
}

async function runInputEntityGroupPrompt() {
	return await input({
		message: "Entity group: (e.g. core)",
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

async function runConfirmInstallPackagesPrompt() {
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

export async function runAdd() {
	let state: State = "select-which";

	const config = await Config.new();

	const resources = await Resources.new(config.containerDirPath);

	if (Object.keys(resources.nameToConfig).length === 0) {
		state = "add-graph.select-entry-resource";
	}

	let loop = true;

	const resourceTemplates = setResourceTemplates();

	while (loop) {
		switch (state) {
			case "select-which": {
				const which = await runSelectWhichPrompt();
				state =
					which === "graph"
						? "add-graph.select-entry-resource"
						: "add-single.select-any-resource";
				break;
			}
			case "add-graph.select-entry-resource": {
				const entryResourceId = await runSelectEntryResourcePrompt(
					getResourceTemplateSelectPromptListItems(resourceTemplates, [
						"api",
						"web",
					]),
				);

				const entryResourceTemplate = resourceTemplates[entryResourceId];

				const entryResourceEntityGroup =
					entryResourceTemplate?.type === "web"
						? "web"
						: await runInputEntityGroupPrompt();

				entryResourceEntityGroup === "web" &&
					console.log("✔ Entity group set to web");

				const entryResourceEntity = await runInputEntityPrompt();

				const apiResourceTemplateId =
					entryResourceTemplate?.type === "web"
						? await runSelectApiResourcePrompt(
								getResourceTemplateSelectPromptListItems(resourceTemplates, [
									"api",
								]),
							)
						: "";

				const apiResourceEntityGroup =
					apiResourceTemplateId !== "" && apiResourceTemplateId !== "skip"
						? await runInputEntityGroupPrompt()
						: "";

				const apiResourceEntity = apiResourceEntityGroup
					? await runInputEntityPrompt()
					: "";

				const dbResourceTemplateId =
					apiResourceTemplateId && apiResourceTemplateId !== "skip"
						? await runSelectDbResourcePrompt(
								getResourceTemplateSelectPromptListItems(resourceTemplates, [
									"db",
								]),
							)
						: "";

				const dbResourceEntityGroup =
					dbResourceTemplateId !== "" && dbResourceTemplateId !== "skip"
						? await runInputEntityGroupPrompt()
						: "";

				const dbResourceEntity = dbResourceEntityGroup
					? await runTestLoadPrompt()
					: "";

				const resource = setResource({
					entityGroup: entryResourceEntityGroup,
					entity: entryResourceEntity,
					cloud: "cf",
					cloudService: "pages",
					descriptor: entryResourceTemplate.descriptor,
				});

				const __filename = fileURLToPath(import.meta.url);
				const __dirname = dirname(__filename);

				const templateSrc = "github:gasdotdev/gas/templates#master";
				const templateDir = join(__dirname, "..", "..", ".giget");

				await downloadTemplate(templateSrc, {
					dir: templateDir,
					forceClean: true,
				});

				const resourceKebabCaseName = setResourceKebabCaseName(resource);

				const templateDestinationDir = path.join(
					config.containerDirPath,
					resourceKebabCaseName,
				);

				await fs.cp(
					path.join(templateDir, "cloudflare-pages-remix"),
					templateDestinationDir,
					{ recursive: true },
				);

				const packageJsonPath = path.join(
					templateDestinationDir,
					"package.json",
				);

				const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
				const packageJson = JSON.parse(packageJsonContent);

				packageJson.name = resourceKebabCaseName;

				await fs.writeFile(
					packageJsonPath,
					JSON.stringify(packageJson, null, 2),
				);

				const oldFilePath = path.join(
					templateDestinationDir,
					"src",
					"index.entity-group.entity.cloud.cloud-service.descriptor.ts",
				);

				const newFileName =
					// biome-ignore lint/style/useTemplate: <explanation>
					[
						"index",
						entryResourceEntityGroup,
						entryResourceEntity,
						entryResourceTemplate.cloud,
						entryResourceTemplate.cloudService,
						entryResourceTemplate.descriptor,
					].join(".") + ".ts";

				const newFilePath = path.join(
					templateDestinationDir,
					"src",
					newFileName,
				);

				await fs.rename(oldFilePath, newFilePath);

				const mod = await loadFile(newFilePath);

				const ast = mod.exports.$ast;

				mod.exports.entityGroupEntityCloudCloudServiceDescriptor.$args[0].name =
					setResourceUpperSnakeCaseName(resource);

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
						setResourceCamelCaseName(resource);
				} else {
					console.log("export config const not found in the file");
				}

				await writeFile(mod, newFilePath);

				const viteConfigFilePath = path.join(
					templateDestinationDir,
					"vite.config.ts",
				);

				const viteConfigContent = await fs.readFile(
					viteConfigFilePath,
					"utf-8",
				);

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

				loop = false;

				const confirmInstallPackages = await runConfirmInstallPackagesPrompt();

				if (confirmInstallPackages) {
					await installPackages();
				}

				break;
				// ... existing code ...
			}
			case "add-single.select-any-resource": {
				const selectedOption = await runSelectAnyResourcePrompt();
				break;
			}
		}
	}
}
