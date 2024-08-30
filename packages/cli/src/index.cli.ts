#!/usr/bin/env node
import { parseArgs } from "node:util";

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

Options:
	--help, -h Print help`;

		if (parsedArgs.values.help) {
			console.log(helpMessage);
		}
	} catch (error) {
		console.error(error);
	}
}
