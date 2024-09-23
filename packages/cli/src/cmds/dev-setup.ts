import fs from "node:fs/promises";
import http from "node:http";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setConfig } from "../modules/config.js";
import {
	type ResourceConfigData,
	type Resources,
	setResources,
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

type PortToCloudflarePagesResourceName = Record<number, string>;

async function setPortToCloudflarePagesResourceName(
	startPort: number,
	resourceConfigData: ResourceConfigData,
): Promise<{
	portToCloudflarePagesResourceName: PortToCloudflarePagesResourceName;
	lastPortUsed: number;
}> {
	const portToCloudflarePagesResourceName: PortToCloudflarePagesResourceName =
		{};
	let lastPortUsed = startPort;
	for (const resourceName in resourceConfigData) {
		if (resourceConfigData[resourceName].functionName === "cloudflarePages") {
			const port = await setAvailablePort(lastPortUsed);
			portToCloudflarePagesResourceName[port] = resourceName;
			lastPortUsed = port + 1;
		}
	}
	return { portToCloudflarePagesResourceName, lastPortUsed };
}

async function writeCloudflarePagesResourceDotEnvFiles(
	portToCloudflarePagesResourceName: PortToCloudflarePagesResourceName,
	resources: Resources,
	devServerPort: number,
): Promise<void> {
	const promises = [];
	for (const [port, resourceName] of Object.entries(
		portToCloudflarePagesResourceName,
	)) {
		const indexFilePath = resources.indexFilePaths[resourceName];
		if (indexFilePath) {
			const envContent = `GAS_DEV_SERVER_PORT=${devServerPort}\nGAS_${resourceName}_PORT=${port}\n`;
			const envFilePath = path.join(
				path.dirname(indexFilePath),
				"..",
				".env.dev",
			);
			promises.push(fs.writeFile(envFilePath, envContent));
		}
	}
	await Promise.all(promises);
}

export type DevManifest = {
	resources: Resources;
	devServerPort: number;
	miniflarePort: number;
	portToCloudflarePagesResourceName: PortToCloudflarePagesResourceName;
};

function setDevManifest({
	resources,
	devServerPort,
	miniflarePort,
	portToCloudflarePagesResourceName,
}: {
	resources: Resources;
	devServerPort: number;
	miniflarePort: number;
	portToCloudflarePagesResourceName: PortToCloudflarePagesResourceName;
}): DevManifest {
	return {
		resources: {
			containerDirPath: resources.containerDirPath,
			containerSubdirPaths: resources.containerSubdirPaths,
			list: resources.list,
			packageJsons: resources.packageJsons,
			packageJsonNameToName: resources.packageJsonNameToName,
			deps: resources.deps,
			indexFilePaths: resources.indexFilePaths,
			buildIndexFilePaths: resources.buildIndexFilePaths,
			indexFileContents: resources.indexFileContents,
			configData: resources.configData,
			nodeJsConfigScript: resources.nodeJsConfigScript,
			runNodeJsConfigScriptResult: resources.runNodeJsConfigScriptResult,
			configs: resources.configs,
		},
		devServerPort,
		miniflarePort,
		portToCloudflarePagesResourceName,
	};
}

export async function runDevSetup(): Promise<void> {
	const config = await setConfig();

	const resources = await setResources(config.containerDirPath);

	const devServerPort = await setAvailablePort(3000);

	const { portToCloudflarePagesResourceName, lastPortUsed } =
		await setPortToCloudflarePagesResourceName(
			devServerPort + 1,
			resources.configData,
		);

	const miniflarePort = await setAvailablePort(lastPortUsed + 1);

	await writeCloudflarePagesResourceDotEnvFiles(
		portToCloudflarePagesResourceName,
		resources,
		devServerPort,
	);

	const devManifest = setDevManifest({
		resources,
		devServerPort,
		miniflarePort,
		portToCloudflarePagesResourceName,
	});

	const devManifestJson = JSON.stringify(devManifest, null, 2);

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	await fs.writeFile(
		join(__dirname, "..", "..", ".dev-manifest.json"),
		devManifestJson,
	);
}
