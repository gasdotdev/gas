#!/usr/bin/env node
import { parseArgs } from "node:util";
import { Config } from "./config.js";
import { Resources } from "./resources.js";
import { add } from "./add.js";

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
			default:
				console.log(helpMessage);
		}
	} catch (error) {
		console.error(error);
	}
}
