#!/usr/bin/env node
import { parseArgs } from "node:util";
import { add } from "./add.js";
import { dev } from "./dev.js";

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

gas [command] [options]

Available commands:
  add         Add a new item (placeholder)
  dev         Run the dev server
Options:
	--help, -h Print help`;

		if (parsedArgs.values.help) {
			console.log(helpMessage);
			return;
		}

		const command = parsedArgs.positionals[0];
		switch (command) {
			case "add": {
				await add();
				break;
			}
			case "dev": {
				await dev();
				break;
			}
			default:
				console.log(helpMessage);
		}
	} catch (error) {
		if (error.name === "ExitPromptError") {
			process.exit(0);
		}
		console.error(error);
	}
}
