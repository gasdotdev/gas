#!/usr/bin/env node
import { exec as execCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import util from "node:util";
import { confirm, input, select } from "@inquirer/prompts";

const exec = util.promisify(execCallback);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
		if (error.name === "ExitPromptError") {
			process.exit(0);
		}
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

async function selectFormatterPrompt() {
	const res = await select({
		message: "Select formatter:",
		choices: [
			{ name: "Biome", value: "biome" },
			{ name: "Prettier", value: "prettier" },
		],
	});
	return res;
}

async function runInstallDependenciesPrompt() {
	const res = await confirm({
		message: "Install dependencies?",
	});
	return res;
}

async function getLatestPackageVersion(packageName: string): Promise<string> {
	const { stdout } = await exec(`npm view ${packageName} version`);
	return stdout.trim();
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
	const formatter = await selectFormatterPrompt();

	if (!dirExists) {
		console.log(`Creating directory ${dir}`);
		await fs.mkdir(dir, { recursive: true });
	}

	if (dirContents.length > 0) {
		console.log(`Emptying directory ${dir}`);
		await fs.rm(dir, { recursive: true, force: true });
	}

	const templateDir = path.join(__dirname, "..", "..", "template");

	console.log(`Copying template from ${templateDir} to ${dir}`);
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

	const packageJsonPath = path.join(dir, "package.json");
	const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
	const packageJson = JSON.parse(packageJsonContent);

	const vscodeDir = path.join(dir, ".vscode");
	await fs.mkdir(vscodeDir, { recursive: true });

	let vscodeSettings = {};

	if (formatter === "biome") {
		const biomeVersion = await getLatestPackageVersion("@biomejs/biome");
		packageJson.devDependencies["@biomejs/biome"] = `^${biomeVersion}`;

		vscodeSettings = {
			"editor.formatOnSave": true,
			"[javascript]": {
				"editor.defaultFormatter": "biomejs.biome",
			},
			"[typescript]": {
				"editor.defaultFormatter": "biomejs.biome",
			},
			"[javascriptreact]": {
				"editor.defaultFormatter": "biomejs.biome",
			},
			"[typescriptreact]": {
				"editor.defaultFormatter": "biomejs.biome",
			},
			"[json]": {
				"editor.defaultFormatter": "biomejs.biome",
			},
			"[jsonc]": {
				"editor.defaultFormatter": "biomejs.biome",
			},
			"editor.codeActionsOnSave": {
				"quickfix.biome": "explicit",
				"source.organizeImports.biome": "explicit",
			},
		};
	} else if (formatter === "prettier") {
		const prettierVersion = await getLatestPackageVersion("prettier");
		packageJson.devDependencies.prettier = `^${prettierVersion}`;

		vscodeSettings = {
			"editor.formatOnSave": true,
			"editor.defaultFormatter": "esbenp.prettier-vscode",
		};
	}

	await fs.writeFile(
		path.join(vscodeDir, "settings.json"),
		JSON.stringify(vscodeSettings, null, 2),
	);

	await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

	const installDependencies = await runInstallDependenciesPrompt();

	if (installDependencies) {
		console.log("Installing dependencies...");
		try {
			const { stdout, stderr } = await exec(`${packageManager} install`, {
				cwd: dir,
			});
			console.log(stdout);
			if (stderr) {
				console.error(stderr);
			}
			console.log("Dependencies installed successfully.");
		} catch (error) {
			console.error("Error installing dependencies:", error);
		}
	}
}
