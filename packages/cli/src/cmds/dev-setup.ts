import fs from "node:fs/promises";
import http from "node:http";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "../modules/config.js";
import {
	type ResourceNameToConfigData,
	type ResourceValues,
	Resources,
} from "../modules/resources.js";

async function setAvailablePort(startPort: number): Promise<number> {
	let port = startPort;
	let isAvailable = false;

	while (!isAvailable) {
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

		if (!isAvailable) {
			port++;
		}
	}

	return port;
}

type CloudflarePagesResourceNameToPort = Record<string, number>;

async function setCloudflarePagesResourceNameToPort(
	startPort: number,
	resourceNameToConfigData: ResourceNameToConfigData,
): Promise<{
	nameToPort: CloudflarePagesResourceNameToPort;
	lastPortUsed: number;
}> {
	const nameToPort: CloudflarePagesResourceNameToPort = {};
	let lastPortUsed = startPort;
	for (const name in resourceNameToConfigData) {
		if (resourceNameToConfigData[name].functionName === "cloudflarePages") {
			const port = await setAvailablePort(lastPortUsed);
			nameToPort[name] = port;
			lastPortUsed = port + 1;
		}
	}
	return { nameToPort, lastPortUsed };
}

async function writeCloudflarePagesResourceDotEnvFiles(
	cloudflarePagesResourceNameToPort: Record<string, number>,
	resources: Resources,
	devServerPort: number,
): Promise<void> {
	const writeEnvPromises = [];

	for (const [resourceName, port] of Object.entries(
		cloudflarePagesResourceNameToPort,
	)) {
		const indexFilePath = resources.nameToIndexFilePath[resourceName];
		if (indexFilePath) {
			const envContent = `GAS_DEV_SERVER_PORT=${devServerPort}\nGAS_${resourceName}_PORT=${port}\n`;
			const envFilePath = path.join(
				path.dirname(indexFilePath),
				"..",
				".env.dev",
			);
			writeEnvPromises.push(fs.writeFile(envFilePath, envContent));
		}
	}

	await Promise.all(writeEnvPromises);
}

export type DevManifest = {
	resources: ResourceValues;
	devServerPort: number;
	miniflarePort: number;
	resourceNameToPort: CloudflarePagesResourceNameToPort;
};

function setDevManifest({
	resources,
	devServerPort,
	miniflarePort,
	cloudflarePagesResourceNameToPort,
}: {
	resources: ResourceValues;
	devServerPort: number;
	miniflarePort: number;
	cloudflarePagesResourceNameToPort: CloudflarePagesResourceNameToPort;
}): DevManifest {
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
		resourceNameToPort: cloudflarePagesResourceNameToPort,
	};
}

export async function runDevSetup(): Promise<void> {
	const config = await Config.new();

	const resources = await Resources.new(config.containerDirPath);

	const devServerPort = await setAvailablePort(3000);

	const { nameToPort: cloudflarePagesResourceNameToPort, lastPortUsed } =
		await setCloudflarePagesResourceNameToPort(
			devServerPort + 1,
			resources.nameToConfigData,
		);

	const miniflarePort = await setAvailablePort(lastPortUsed + 1);

	await writeCloudflarePagesResourceDotEnvFiles(
		cloudflarePagesResourceNameToPort,
		resources,
		devServerPort,
	);

	const devManifest = setDevManifest({
		resources,
		devServerPort,
		miniflarePort,
		cloudflarePagesResourceNameToPort,
	});

	const devManifestJson = JSON.stringify(devManifest, null, 2);

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	await fs.writeFile(
		join(__dirname, "..", "..", ".dev-manifest.json"),
		devManifestJson,
	);
}
