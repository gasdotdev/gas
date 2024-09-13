import fs from "node:fs/promises";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "./config.js";
import { type ResourceNameToConfigData, Resources } from "./resources.js";

/**
 * Sets an available port.
 *
 * @param startPort - The port to start checking from.
 * @returns The available port.
 */
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

/**
 * Sets the ports for Cloudflare Pages resources.
 *
 * @param startPort - The port to start checking from.
 * @param resourceNameToConfigData - The configuration data for each resource.
 * @returns The dotenv, last port used, and resource name to port.
 */
async function setCloudflarePagesResourcePorts(
	startPort: number,
	resourceNameToConfigData: ResourceNameToConfigData,
) {
	let dotenv = "";
	const resourceNameToPort: { [name: string]: number } = {};
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

export async function devSetup(): Promise<void> {
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

	const devSetup = {
		resources: {
			containerDirPath: resources.containerDirPath,
			containerSubdirPaths: resources.containerSubdirPaths,
			nameToPackageJson: Object.fromEntries(resources.nameToPackageJson),
			packageJsonNameToName: Object.fromEntries(
				resources.packageJsonNameToName,
			),
			nameToDeps: resources.nameToDeps,
			nameToIndexFilePath: resources.nameToIndexFilePath,
			nameToBuildIndexFilePath: resources.nameToBuildIndexFilePath,
			nameToIndexFileContent: resources.nameToIndexFileContent,
			nameToConfigData: resources.nameToConfigData,
			nodeJsConfigScript: resources.nodeJsConfigScript,
			runNodeJsConfigScriptResult: resources.runNodeJsConfigScriptResult,
			nameToConfig: Object.fromEntries(resources.nameToConfig),
		},
		devServerPort,
		miniflarePort,
		resourcePorts: cloudflarePagesResourcePorts.resourceNameToPort,
	};

	const devSetupJson = JSON.stringify(devSetup, null, 2);

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	await fs.writeFile(
		join(__dirname, "..", "..", ".dev-setup.json"),
		devSetupJson,
	);
}
