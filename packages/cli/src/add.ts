import fs from "node:fs/promises";
import path from "node:path";
import { input, select } from "@inquirer/prompts";
import { downloadTemplate } from "giget";
import { loadFile, writeFile } from "magicast";
import { Config } from "./config.js";
import {
	ResourceTemplates,
	type ResourceTemplatesSelectPromptListItems,
} from "./resource-templates.js";
import { Resources } from "./resources.js";

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

function resourceIdToCamelCase(id: string): string {
	return id
		.split("-")
		.map((part, index) =>
			index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
		)
		.join("");
}

function resourceIdToUpperSnakeCase(id: string): string {
	return id.replace(/-/g, "_").toUpperCase();
}

export async function add() {
	let state: State = "select-which";

	const config = await Config.new();

	const resources = await Resources.new(config.containerDirPath);

	if (Object.keys(resources.nameToConfig).length === 0) {
		state = "add-graph.select-entry-resource";
	}

	let loop = true;

	const resourceTemplates = ResourceTemplates.new();

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
					resourceTemplates.getSelectPromptListItems(["api", "web"]),
				);

				const entryResourceTemplate =
					resourceTemplates.map.get(entryResourceId);

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
								resourceTemplates.getSelectPromptListItems(["api"]),
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
								resourceTemplates.getSelectPromptListItems(["db"]),
							)
						: "";

				const dbResourceEntityGroup =
					dbResourceTemplateId !== "" && dbResourceTemplateId !== "skip"
						? await runInputEntityGroupPrompt()
						: "";

				const dbResourceEntity = dbResourceEntityGroup
					? await runTestLoadPrompt()
					: "";

				const resourceId = `${entryResourceEntityGroup}-${entryResourceEntity}-${entryResourceTemplate?.descriptor}`;

				const templateSrc =
					"github:gasdotdev/gas/templates/cloudflare-pages-remix#master";
				const templateDir = path.join(config.containerDirPath, resourceId);

				await downloadTemplate(templateSrc, {
					dir: templateDir,
					forceClean: true,
				});

				const packageJsonPath = path.join(templateDir, "package.json");

				const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
				const packageJson = JSON.parse(packageJsonContent);

				packageJson.name = resourceId;

				await fs.writeFile(
					packageJsonPath,
					JSON.stringify(packageJson, null, 2),
				);

				const oldFilePath = path.join(
					templateDir,
					"index.entity-group.entity.descriptor.ts",
				);
				const newFilePath = path.join(
					templateDir,
					`index.${entryResourceEntityGroup}.${entryResourceEntity}.${entryResourceTemplate?.descriptor}.ts`,
				);

				await fs.rename(oldFilePath, newFilePath);

				const mod = await loadFile(newFilePath);

				const ast = mod.exports.$ast;

				mod.exports.entityGroupEntityDescriptor.$args[0].name =
					resourceIdToCamelCase(resourceId);

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
							"entityGroupEntityDescriptor",
				);

				if (exportDeclaration?.declaration.declarations[0]) {
					exportDeclaration.declaration.declarations[0].id.name =
						resourceIdToCamelCase(resourceId);
				} else {
					console.log("export config const not found in the file");
				}

				await writeFile(mod, newFilePath);

				loop = false;

				break;
			}
			case "add-single.select-any-resource": {
				const selectedOption = await runSelectAnyResourcePrompt();
				break;
			}
		}
	}
}
