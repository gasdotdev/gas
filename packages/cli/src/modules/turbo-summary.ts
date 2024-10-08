import fs from "node:fs/promises";
import path from "node:path";

export type TurboRunJson = {
	id: string;
	version: string;
	turboVersion: string;
	monorepo: boolean;
	globalCacheInputs: {
		rootKey: string;
		files: Record<string, never>;
		hashOfExternalDependencies: string;
		hashOfInternalDependencies: string;
		environmentVariables: {
			specified: {
				env: string[];
				passThroughEnv: null;
			};
			configured: string[];
			inferred: string[];
			passthrough: null;
		};
		engines: null;
	};
	execution: {
		command: string;
		repoPath: string;
		success: number;
		failed: number;
		cached: number;
		attempted: number;
		startTime: number;
		endTime: number;
		exitCode: number;
	};
	packages: string[];
	envMode: string;
	frameworkInference: boolean;
	tasks: Array<{
		taskId: string;
		task: string;
		package: string;
		hash: string;
		inputs: Record<string, string>;
		hashOfExternalDependencies: string;
		cache: {
			local: boolean;
			remote: boolean;
			status: string;
			timeSaved: number;
		};
		command: string;
		cliArguments: string[];
		outputs: null;
		excludedOutputs: null;
		logFile: string;
		directory: string;
		dependencies: string[];
		dependents: string[];
		resolvedTaskDefinition: {
			outputs: string[];
			cache: boolean;
			dependsOn: string[];
			inputs: string[];
			outputLogs: string;
			persistent: boolean;
			env: string[];
			passThroughEnv: null;
			interactive: boolean;
		};
		expandedOutputs: string[];
		framework: string;
		envMode: string;
		environmentVariables: {
			specified: {
				env: string[];
				passThroughEnv: null;
			};
			configured: string[];
			inferred: string[];
			passthrough: null;
		};
		execution: {
			startTime: number;
			endTime: number;
			exitCode: number;
		};
	}>;
	user: string;
	scm: {
		type: string;
		sha: string;
		branch: string;
	};
};

export async function getTurboRunJson(): Promise<TurboRunJson> {
	const res = {} as TurboRunJson;

	const turboRunsDir = ".turbo/runs";

	try {
		await fs.access(turboRunsDir);
	} catch (err) {
		return res;
	}

	try {
		const files = await fs.readdir(turboRunsDir);
		const jsonFiles = files.filter((file) => path.extname(file) === ".json");

		if (jsonFiles.length === 0) {
			return res;
		}

		const fullPaths = jsonFiles.map((file) => path.join(turboRunsDir, file));
		const fileStats = await Promise.all(
			fullPaths.map(async (filePath) => {
				const stats = await fs.stat(filePath);
				return { filePath, mtime: stats.mtime };
			}),
		);

		fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

		const newestFilePath = fileStats[0].filePath;
		const fileContent = await fs.readFile(newestFilePath, "utf-8");
		Object.assign(res, JSON.parse(fileContent));

		return res;
	} catch (err) {
		throw new Error(`Error reading Turbo summary: ${(err as Error).message}`);
	}
}

export type TurboPackageToHash = Record<string, string>;

function setPackageToHash(turboSummary: TurboRunJson): TurboPackageToHash {
	const res: TurboPackageToHash = {};
	for (const task of turboSummary.tasks) {
		res[task.package] = task.hash;
	}
	return res;
}

export type TurboSummary = {
	packageToHash: TurboPackageToHash;
};

export async function setTurboSummary(): Promise<TurboSummary> {
	const turboRunJson = await getTurboRunJson();
	const packageToHash = setPackageToHash(turboRunJson);
	return { packageToHash };
}
