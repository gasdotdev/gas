import fs from "node:fs/promises";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "./config.js";
import { Resources } from "./resources.js";

async function findAvailablePort(startPort: number): Promise<number> {
	let port = startPort;
	let isAvailable = false;

	while (!isAvailable) {
		try {
			await new Promise((resolve, reject) => {
				const testServer = http
					.createServer()
					.once("error", (err: NodeJS.ErrnoException) => {
						if (err.code === "EADDRINUSE") {
							resolve(false);
						} else {
							reject(err);
						}
					})
					.once("listening", () => {
						testServer.close(() => {
							isAvailable = true;
							resolve(true);
						});
					})
					.listen(port);
			});
		} catch (error) {
			throw new Error(
				`An error occurred while checking port availability: ${error}`,
			);
		}

		if (!isAvailable) {
			port++;
		}
	}

	return port;
}

export async function devSetup(): Promise<void> {
	const config = await Config.new();

	const resources = await Resources.new(config.containerDirPath);

	const devServerPort = await findAvailablePort(3000);

	let dotenv = `GAS_DEV_SERVER_PORT=${devServerPort}\n`;
	let lastPagesPort = devServerPort + 1;
	const resourcePorts: { [name: string]: number } = {};

	for (const name in resources.nameToConfigData) {
		if (resources.nameToConfigData[name].functionName === "cloudflarePages") {
			const pagesPort = await findAvailablePort(lastPagesPort);
			dotenv += `GAS_${name}_PORT=${pagesPort}\n`;
			resourcePorts[name] = pagesPort;
			lastPagesPort = pagesPort + 1;
		}
	}

	const miniflarePort = await findAvailablePort(lastPagesPort + 1);

	await fs.writeFile("./.env.dev", dotenv);

	const devSetupData = {
		containerDirPath: resources.containerDirPath,
		nameToConfigData: resources.nameToConfigData,
		nameToConfig: Object.fromEntries(resources.nameToConfig),
		nameToBuildIndexFilePath: resources.nameToBuildIndexFilePath,
		devServerPort,
		miniflarePort,
		resourcePorts,
	};

	const devSetupJson = JSON.stringify(devSetupData, null, 2);

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	await fs.writeFile(
		join(__dirname, "..", "..", ".dev-setup.json"),
		devSetupJson,
	);
}
