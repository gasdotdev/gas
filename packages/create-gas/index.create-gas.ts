#!/usr/bin/env node
import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { confirm, input, select } from "@inquirer/prompts";

await main();

async function main() {
	try {
		const options = {
			help: {
				type: "boolean",
				short: "h",
			},
		} as const;

		const parsedArgs = parseArgs({
			allowPositionals: true,
			options,
			strict: false,
		});

		const helpMessage = `Usage:
create-gas -> Initalize project

Options:
	--help, -h Print help`;

		if (
			parsedArgs.positionals.length === 0 &&
			Object.keys(parsedArgs.values).length === 0
		) {
			await create();
		} else if (parsedArgs.values.help) {
			console.log(helpMessage);
		} else {
			console.log(helpMessage);
		}
	} catch (error) {
		console.error(error);
	}
}

async function runDirInputPrompt() {
	const res = await input({
		message: "Enter directory:",
		required: true,
		validate: (input) => {
			if (input.trim() === "") {
				return "Directory is required.";
			}
			return true;
		},
	});
	return res;
}

async function runEmptyDirPrompt(dir: string) {
	const res = await select({
		message: `${dir} is not empty. Empty it?`,
		choices: [
			{ name: "No", value: "no" },
			{ name: "Yes", value: "yes" },
			{ name: "Cancel", value: "cancel" },
		],
	});
	return res;
}

async function selectPackageManagerPrompt() {
	const res = await select({
		message: "Select package manager:",
		choices: [{ name: "npm", value: "npm" }],
	});
	return res;
}

async function runInstallDepsPrompt() {
	const res = await confirm({
		message: "Install dependencies?",
	});
	return res;
}

async function create() {
	let loop = false;

	let dir = await runDirInputPrompt();

	const dirExists = await fs
		.access(dir)
		.then(() => true)
		.catch(() => false);

	let emptyDirPromptRes = "";

	let dirContents: string[] = [];

	if (dirExists) {
		dirContents = await fs.readdir(dir);

		if (dirContents.length > 0) {
			loop = true;

			while (loop) {
				emptyDirPromptRes = await runEmptyDirPrompt(dir);

				switch (emptyDirPromptRes) {
					case "no":
						dir = await runDirInputPrompt();
						break;
					case "yes":
						loop = false;
						break;
					case "cancel":
						return;
				}
			}
		}
	}

	const packageManager = await selectPackageManagerPrompt();

	if (!dirExists) {
		console.log(`Creating directory ${dir}`);
		await fs.mkdir(dir, { recursive: true });
	}

	if (dirContents.length > 0) {
		console.log(`Emptying directory ${dir}`);
		await fs.rm(dir, { recursive: true, force: true });
	}

	const templateDir = path.join(
		path.dirname(path.dirname(new URL(import.meta.url).pathname)),
		"template",
	);

	console.log(`Copying template to ${dir}`);
	await fs.cp(templateDir, dir, { recursive: true });

	await fs.unlink(path.join(dir, "./gas", ".gitkeep"));

	const gasConfig = await fs.readFile(
		path.join(dir, "./gas.config.json"),
		"utf-8",
	);
	const gasConfigJson = JSON.parse(gasConfig);
	gasConfigJson.project = path.basename(dir);
	await fs.writeFile(
		path.join(dir, "./gas.config.json"),
		JSON.stringify(gasConfigJson, null, 2),
	);

	const turboJson = await fs.readFile(path.join(dir, "./turbo.json"), "utf-8");
	const turboJsonJson = JSON.parse(turboJson);
	turboJsonJson.extends = undefined;
	await fs.writeFile(
		path.join(dir, "./turbo.json"),
		JSON.stringify(turboJsonJson, null, 2),
	);
	const installDeps = await runInstallDepsPrompt();

	if (installDeps) {
		console.log("Installing dependencies...");
		await exec(`${packageManager} install`, { cwd: dir });
	}
}
