import fs from "node:fs/promises";
import http from "node:http";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setConfig } from "../modules/config.js";
import {
	type ResourceNameToConfigAst,
	type ResourceNameToPackageJson,
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

type PortToViteBasedResourceName = Record<number, string>;

async function setPortToViteBasedResourceName(
	startPort: number,
	resourceNameToConfigAst: ResourceNameToConfigAst,
	resourceNameToPackageJson: ResourceNameToPackageJson,
): Promise<{
	portToViteBasedResourceName: PortToViteBasedResourceName;
	lastPortUsed: number;
}> {
	const portToViteBasedResourceName: PortToViteBasedResourceName = {};
	let lastPortUsed = startPort;
	for (const resourceName in resourceNameToConfigAst) {
		if (
			resourceNameToConfigAst[resourceName].function ===
				"cloudflareWorkerSite" &&
			resourceNameToPackageJson[resourceName]?.dependencies?.[
				"@remix-run/react"
			]
		) {
			const port = await setAvailablePort(lastPortUsed);
			portToViteBasedResourceName[port] = resourceName;
			lastPortUsed = port + 1;
		}
	}
	return { portToViteBasedResourceName, lastPortUsed };
}

async function writeViteBasedResourceDotEnvFiles(
	portToViteBasedResourceName: PortToViteBasedResourceName,
	resources: Resources,
	devServerPort: number,
): Promise<void> {
	const promises = [];
	for (const [port, resourceName] of Object.entries(
		portToViteBasedResourceName,
	)) {
		const configFilePath = resources.nameToFiles[resourceName].configPath;
		if (configFilePath) {
			const envContent = `GAS_DEV_SERVER_PORT=${devServerPort}\nGAS_${resourceName}_PORT=${port}\n`;
			const envFilePath = path.join(
				path.dirname(configFilePath),
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
	portToViteBasedResourceName: PortToViteBasedResourceName;
};

function setDevManifest({
	resources,
	devServerPort,
	miniflarePort,
	portToViteBasedResourceName,
}: DevManifest): DevManifest {
	return {
		resources,
		devServerPort,
		miniflarePort,
		portToViteBasedResourceName,
	};
}

export async function runDevSetup(): Promise<void> {
	const config = await setConfig();

	const resources = await setResources(config.containerDirPath);

	const devServerPort = await setAvailablePort(3000);

	const { portToViteBasedResourceName, lastPortUsed } =
		await setPortToViteBasedResourceName(
			devServerPort + 1,
			resources.nameToConfigAst,
			resources.nameToPackageJson,
		);

	const miniflarePort = await setAvailablePort(lastPortUsed + 1);

	await writeViteBasedResourceDotEnvFiles(
		portToViteBasedResourceName,
		resources,
		devServerPort,
	);

	const devManifest = setDevManifest({
		resources,
		devServerPort,
		miniflarePort,
		portToViteBasedResourceName,
	});

	const devManifestJson = JSON.stringify(devManifest, null, 2);

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	await fs.writeFile(
		join(__dirname, "..", "..", ".dev-manifest.json"),
		devManifestJson,
	);
}
