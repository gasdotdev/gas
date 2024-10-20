#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { runAdd } from './cmds/add.js';
import { runDevSetup } from './cmds/dev-setup.js';
import { runDevStart } from './cmds/dev-start.js';
import { runUp } from './cmds/up.js';

await main();

async function main() {
	try {
		const options = {
			help: {
				type: 'boolean',
				short: 'h',
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
  add         Add new resource(s)
  dev:setup   Setup dev environment
  dev:start   Start dev server
  up          Deploy resources to the cloud
Options:
	--help, -h Print help`;

		if (parsedArgs.values.help) {
			console.log(helpMessage);
			return;
		}

		const command = parsedArgs.positionals[0];
		switch (command) {
			case 'add': {
				await runAdd();
				break;
			}
			case 'dev:setup': {
				await runDevSetup();
				break;
			}
			case 'dev:start': {
				await runDevStart();
				break;
			}
			case 'up': {
				await runUp();
				break;
			}
			default:
				console.log(helpMessage);
		}
	} catch (error) {
		if (error.name === 'ExitPromptError') {
			process.exit(0);
		}
		console.error(error);
	}
}
