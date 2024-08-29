#!/usr/bin/env node
import { parseArgs } from 'node:util';

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
			console.log('create-gas');
		} else if (parsedArgs.values.help) {
			console.log(helpMessage);
		} else {
			console.log(helpMessage);
		}
	} catch (error) {
		console.error(error);
	}
}
