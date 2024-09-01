import { select } from "@inquirer/prompts";
import { Config } from "./config.js";
import { Resources } from "./resources.js";

type State =
	| "select-which"
	| "select-entry-resource"
	| "select-resource-template";

async function runSelectWhichPrompt() {
	return await select({
		message: "Add resource(s):",
		choices: [
			{ name: "Build new graph", value: "graph" },
			{ name: "Add to existing graph", value: "existing" },
		],
	});
}

async function runSelectEntryResourcePrompt() {
	return await select({
		message: "Select entry resource:",
		choices: [
			{ name: "Cloudflare Pages + Remix", value: "cloudflare-pages-remix" },
		],
	});
}

async function runSelectResourceTemplatePrompt() {
	return await select({
		message: "Select a template",
		choices: [
			{ name: "Cloudflare Pages + Remix", value: "cloudflare-pages-remix" },
		],
	});
}

export async function add() {
	let state: State = "select-which";

	const config = await Config.new();

	const resources = await Resources.new(config.containerDirPath);

	if (Object.keys(resources.nameToConfig).length === 0) {
		state = "select-entry-resource";
	}

	const loop = true;

	while (loop) {
		switch (state) {
			case "select-which": {
				const selectedOption = await runSelectWhichPrompt();
				break;
			}
			case "select-entry-resource": {
				const selectedOption = await runSelectEntryResourcePrompt();
				break;
			}
		}
	}

	const template = await runSelectResourceTemplatePrompt();
	console.log(template);
}

// TODO: How to handle errors?
