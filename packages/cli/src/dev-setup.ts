import fs from "node:fs/promises";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "./config.js";
import {
	type ResourceNameToConfigData,
	type ResourceValues,
	Resources,
} from "./resources.js";

type DevSetup = {
	resources: ResourceValues;
	devServerPort: number;
	miniflarePort: number;
	resourceNameToPort: ResourceNameToPort;
};

async function setAvailablePort(startPort: number): Promise<number> {
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

type ResourceNameToPort = Record<string, number>;

async function setCloudflarePagesResourcePorts(
	startPort: number,
	resourceNameToConfigData: ResourceNameToConfigData,
) {
	let dotenv = "";
	const resourceNameToPort: ResourceNameToPort = {};
	let lastPortUsed = startPort;
	for (const name in resourceNameToConfigData) {
		if (resourceNameToConfigData[name].functionName === "cloudflarePages") {
			const port = await setAvailablePort(lastPortUsed);
			dotenv += `GAS_${name}_PORT=${port}\n`;
			resourceNameToPort[name] = port;
			lastPortUsed = port + 1;
		}
	}
	return { dotenv, lastPortUsed, resourceNameToPort };
}

function setDevSetup({
	resources,
	devServerPort,
	miniflarePort,
	resourceNameToPort,
}: {
	resources: ResourceValues;
	devServerPort: number;
	miniflarePort: number;
	resourceNameToPort: ResourceNameToPort;
}): DevSetup {
	return {
		resources: {
			containerDirPath: resources.containerDirPath,
			containerSubdirPaths: resources.containerSubdirPaths,
			nameToPackageJson: resources.nameToPackageJson,
			packageJsonNameToName: resources.packageJsonNameToName,
			nameToDeps: resources.nameToDeps,
			nameToIndexFilePath: resources.nameToIndexFilePath,
			nameToBuildIndexFilePath: resources.nameToBuildIndexFilePath,
			nameToIndexFileContent: resources.nameToIndexFileContent,
			nameToConfigData: resources.nameToConfigData,
			nodeJsConfigScript: resources.nodeJsConfigScript,
			runNodeJsConfigScriptResult: resources.runNodeJsConfigScriptResult,
			nameToConfig: resources.nameToConfig,
		},
		devServerPort,
		miniflarePort,
		resourceNameToPort,
	};
}

export async function runDevSetup(): Promise<void> {
	const config = await Config.new();

	const resources = await Resources.new(config.containerDirPath);

	const devServerPort = await setAvailablePort(3000);

	const dotenv = `GAS_DEV_SERVER_PORT=${devServerPort}\n`;

	const cloudflarePagesResourcePorts = await setCloudflarePagesResourcePorts(
		devServerPort + 1,
		resources.nameToConfigData,
	);

	const miniflarePort = await setAvailablePort(
		cloudflarePagesResourcePorts.lastPortUsed + 1,
	);

	await fs.writeFile("./.env.dev", dotenv);

	const devSetup = setDevSetup({
		resources,
		devServerPort,
		miniflarePort,
		resourceNameToPort: cloudflarePagesResourcePorts.resourceNameToPort,
	});

	const devSetupJson = JSON.stringify(devSetup, null, 2);

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	await fs.writeFile(
		join(__dirname, "..", "..", ".dev-setup.json"),
		devSetupJson,
	);
}
