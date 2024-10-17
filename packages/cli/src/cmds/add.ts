import { exec as execCallback } from "node:child_process";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";
import { confirm, input, select } from "@inquirer/prompts";
import { downloadTemplate as giget } from "giget";
import { builders, generateCode, loadFile } from "magicast";
import colors from "yoctocolors";
import { type Config, setConfig } from "../modules/config.js";
import {
	type ResourceTemplateCategory,
	type ResourceTemplateCloud,
	type ResourceTemplateCloudService,
	type ResourceTemplateDescriptor,
	type ResourceTemplates,
	setResourceTemplates,
} from "../modules/resource-templates.js";
import {
	type ResourceNameToFiles,
	type Resources,
	setResourceEntities,
	setResourceEntityGroups,
	setResources,
} from "../modules/resources.js";
import {
	convertCapitalSnakeCaseToCamelCase,
	convertCapitalSnakeCaseToDotCase,
	convertCapitalSnakeCaseToKebabCase,
	convertObjectToCapitalSnakeCase,
} from "../modules/strings.js";

type State = "select-which" | "new-graph" | "existing-graph";

async function runSelectWhichPrompt() {
	return await select({
		message: "Add resource(s):",
		choices: [
			{ name: "Build new graph", value: "graph" },
			{ name: "Add to existing graph", value: "existing" },
		],
	});
}

export type ResourceTemplateSelectPromptListItem = {
	name: string;
	value: keyof ResourceTemplates;
};

export type ResourceTemplatesSelectPromptListItems =
	ResourceTemplateSelectPromptListItem[];

export const setResourceTemplateSelectPromptListItems = (
	record: ResourceTemplates,
	categories?: ResourceTemplateCategory[],
): ResourceTemplatesSelectPromptListItems => {
	const entries = Object.entries(record);
	return categories
		? entries
				.filter(([_, value]) => categories.includes(value.category))
				.map(([key, value]) => ({
					name: value.name,
					value: key as keyof ResourceTemplates,
				}))
		: entries.map(([key, value]) => ({
				name: value.name,
				value: key as keyof ResourceTemplates,
			}));
};

async function runSelectEntryResourcePrompt(
	resourceTemplates: ResourceTemplates,
) {
	const choices = setResourceTemplateSelectPromptListItems(resourceTemplates, [
		"api",
		"web",
	]);

	return await select({
		message: "Select entry resource:",
		choices,
	});
}

async function runSelectApiEntityGroupPrompt(
	resourceNameToFiles: ResourceNameToFiles,
) {
	const choices: { name: string; value: string }[] = [];

	const apiResourceEntityGroups = setResourceEntityGroups(resourceNameToFiles, [
		"api",
	]);

	const apiResourceEntityGroupChoices = apiResourceEntityGroups.map(
		(group) => ({
			name: group,
			value: group,
		}),
	);

	if (apiResourceEntityGroupChoices.length > 0) {
		choices.push(...apiResourceEntityGroupChoices);
		choices.push({ name: "new", value: "new" });
	} else {
		choices.push({
			name: "core (suggested)",
			value: "core",
		});
		choices.push({ name: "new", value: "new" });
	}

	return await select({
		message: "Select API entity group:",
		choices,
	});
}

async function runInputApiEntityGroupPrompt() {
	return await input({
		message: "Enter API entity group:",
		validate: (value) => {
			if (!value.trim()) {
				return "Entity group is required";
			}
			return true;
		},
	});
}

async function runInputWebEntityPrompt() {
	return await input({
		message: "Enter web resource entity: (e.g. app, blog, landing)",
		validate: (value) => {
			if (!value.trim()) {
				return "Entity is required";
			}
			return true;
		},
	});
}

async function runSelectApiEntityPrompt(
	resourceNameToFiles: ResourceNameToFiles,
) {
	const choices = [];

	const resourceEntities = setResourceEntities(resourceNameToFiles, ["api"]);

	const entityChoices = resourceEntities.map((entity) => ({
		name: entity,
		value: entity,
	}));

	if (entityChoices.length > 0) {
		choices.push(...entityChoices);
		choices.push({ name: "new", value: "new" });
	} else {
		choices.push({ name: "base (suggested)", value: "base" });
		choices.push({ name: "new", value: "new" });
	}

	return await select({
		message: "Select API entity:",
		choices,
	});
}

async function runInputApiEntityPrompt() {
	return await input({
		message: "Enter API entity:",
		validate: (value) => {
			if (!value.trim()) {
				return "Entity is required";
			}
			return true;
		},
	});
}

async function runSelectApiResourcePrompt(
	resourceTemplates: ResourceTemplates,
) {
	const choices = setResourceTemplateSelectPromptListItems(resourceTemplates, [
		"api",
		"skip",
	]);

	return await select({
		message: "Select API resource:",
		choices,
	});
}

async function runSelectDbResourcePrompt(resourceTemplates: ResourceTemplates) {
	const choices = setResourceTemplateSelectPromptListItems(resourceTemplates, [
		"db",
		"skip",
	]);

	return await select({
		message: "Select DB resource:",
		choices,
	});
}

async function runInputEntityGroupPrompt() {
	return await input({
		message: "Entity group:",
		validate: (value) => {
			if (!value.trim()) {
				return "Entity group is required";
			}
			return true;
		},
	});
}

async function runInputEntityPrompt() {
	return await input({
		message: "Entity:",
		validate: (value) => {
			if (!value.trim()) {
				return "Entity is required";
			}
			return true;
		},
	});
}

type AddedResource = {
	entityGroup: string;
	entity: string;
	cloud: ResourceTemplateCloud;
	cloudService: ResourceTemplateCloudService;
	descriptor: ResourceTemplateDescriptor;
	templateKey: keyof ResourceTemplates;
	camelCase: string;
	dotCase: string;
	kebabCase: string;
	indexFilePath: string;
};

type NameToAddedResource = {
	[name: string]: AddedResource;
};

function setAddedResource(params: {
	name: string;
	entityGroup: string;
	entity: string;
	cloud: ResourceTemplateCloud;
	cloudService: ResourceTemplateCloudService;
	descriptor: ResourceTemplateDescriptor;
	templateKey: keyof ResourceTemplates;
	resourceContainerDir: string;
}): AddedResource {
	const kebabCase = convertCapitalSnakeCaseToKebabCase(params.name);
	return {
		entityGroup: params.entityGroup,
		entity: params.entity,
		cloud: params.cloud,
		cloudService: params.cloudService,
		descriptor: params.descriptor,
		templateKey: params.templateKey,
		camelCase: convertCapitalSnakeCaseToCamelCase(params.name),
		dotCase: convertCapitalSnakeCaseToDotCase(params.name),
		kebabCase,
		indexFilePath: join(
			params.resourceContainerDir,
			kebabCase,
			"src",
			`index.${convertCapitalSnakeCaseToDotCase(params.name)}.ts`,
		),
	};
}

type AddedResourceTemplateToCopy = {
	src: string;
	dest: string;
};

function setAddedResourceTemplatesToCopy(
	nameToAddedResource: NameToAddedResource,
	resourceContainerDirPath: string,
	gigetLocalPath: string,
): AddedResourceTemplateToCopy[] {
	const res: AddedResourceTemplateToCopy[] = [];
	for (const name in nameToAddedResource) {
		const resource = nameToAddedResource[name];
		const templateDestinationDir = join(
			resourceContainerDirPath,
			resource.kebabCase,
		);
		res.push({
			src: join(gigetLocalPath, resource.templateKey),
			dest: templateDestinationDir,
		});
	}
	return res;
}

async function copyAddedResourceTemplatesFromGigetLocalSrc(
	addedResourceTemplatesToCopy: AddedResourceTemplateToCopy[],
) {
	const promises: Promise<void>[] = [];
	for (const addedResourceTemplateToCopy of addedResourceTemplatesToCopy) {
		promises.push(
			fs.cp(addedResourceTemplateToCopy.src, addedResourceTemplateToCopy.dest, {
				recursive: true,
			}),
		);
	}
	await Promise.all(promises);
}

type AddedResourceNameToPackageJsonPath = {
	[name: string]: string;
};

function setAddedResourceNameToPackageJsonPath(
	nameToAddedResource: NameToAddedResource,
	resourceContainerDirPath: string,
) {
	const res: AddedResourceNameToPackageJsonPath = {};
	for (const name in nameToAddedResource) {
		const resource = nameToAddedResource[name];
		const packageJsonPath = join(
			resourceContainerDirPath,
			resource.kebabCase,
			"package.json",
		);
		res[name] = packageJsonPath;
	}
	return res;
}

type AddedResourcePackageJson = {
	name: string;
	main?: string;
	types?: string;
	scripts: {
		build?: string;
		dev?: string;
	};
};

type AddedResourceNameToPackageJson = {
	[name: string]: AddedResourcePackageJson;
};

async function setAddedResourceNameToPackageJsons(
	addedResourceNameToPackageJsonPath: AddedResourceNameToPackageJsonPath,
) {
	const res: AddedResourceNameToPackageJson = {};
	for (const name in addedResourceNameToPackageJsonPath) {
		const packageJsonPath = addedResourceNameToPackageJsonPath[name];
		const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
		res[name] = JSON.parse(packageJsonContent);
	}
	return res;
}

function updateAddedResourcePackageJsons(
	nameToAddedResource: NameToAddedResource,
	addedResourceNameToPackageJson: AddedResourceNameToPackageJson,
) {
	for (const name in addedResourceNameToPackageJson) {
		const packageJson = addedResourceNameToPackageJson[name];

		packageJson.name = convertCapitalSnakeCaseToKebabCase(name);

		if (
			packageJson.main?.includes(
				"./src/index.entity-group.entity.descriptor.ts",
			)
		) {
			packageJson.main = packageJson.main.replace(
				"./src/index.entity-group.entity.descriptor.ts",
				`./src/index.${nameToAddedResource[name].dotCase}.ts`,
			);
		}

		if (
			packageJson.types?.includes(
				"./src/index.entity-group.entity.descriptor.ts",
			)
		) {
			packageJson.types = packageJson.types.replace(
				"./src/index.entity-group.entity.descriptor.ts",
				`./src/index.${nameToAddedResource[name].dotCase}.ts`,
			);
		}

		const outFileString =
			"--outfile=build/src/index.entity-group.entity.descriptor.js";

		if (packageJson.scripts?.build?.includes(outFileString)) {
			packageJson.scripts.build = packageJson.scripts.build.replace(
				outFileString,
				`--outfile=build/src/${nameToAddedResource[name].dotCase}.js`,
			);
		}

		if (packageJson.scripts?.dev?.includes(outFileString)) {
			packageJson.scripts.dev = packageJson.scripts.dev.replace(
				outFileString,
				`--outfile=build/src/${nameToAddedResource[name].dotCase}.js`,
			);
		}
	}
}

async function saveAddedResourcePackageJsons(
	addedResourceNameToPackageJsonPath: AddedResourceNameToPackageJsonPath,
	addedResourceNameToPackageJson: AddedResourceNameToPackageJson,
) {
	const promises: Promise<void>[] = [];
	for (const addedResourceName in addedResourceNameToPackageJson) {
		const packageJsonPath =
			addedResourceNameToPackageJsonPath[addedResourceName];
		promises.push(
			fs.writeFile(
				packageJsonPath,
				JSON.stringify(
					addedResourceNameToPackageJson[addedResourceName],
					null,
					2,
				),
			),
		);
	}
	await Promise.all(promises);
}

type AddedResourceNameToIndexFilesToRename = {
	[name: string]: {
		oldPath: string;
		newPath: string;
	};
};

function setAddedResourceNameToIndexFilesToRename(
	nameToAddedResource: NameToAddedResource,
	resourceContainerDirPath: string,
) {
	const res: AddedResourceNameToIndexFilesToRename = {};
	for (const name in nameToAddedResource) {
		const resource = nameToAddedResource[name];

		const oldFilePath = join(
			resourceContainerDirPath,
			resource.kebabCase,
			"src",
			"index.entity-group.entity.cloud.cloud-service.descriptor.ts",
		);

		const newFileName =
			[
				"index",
				resource.entityGroup,
				resource.entity,
				resource.cloud,
				resource.cloudService,
				resource.descriptor,
			].join(".") + ".ts";

		res[name] = {
			oldPath: oldFilePath,
			newPath: join(
				resourceContainerDirPath,
				resource.kebabCase,
				"src",
				newFileName,
			),
		};
	}
	return res;
}

async function renameAddedResourceIndexFiles(
	addedResourceIndexFilesToRename: AddedResourceNameToIndexFilesToRename,
) {
	const promises: Promise<void>[] = [];
	for (const addedResourceName in addedResourceIndexFilesToRename) {
		const { oldPath, newPath } =
			addedResourceIndexFilesToRename[addedResourceName];
		promises.push(fs.rename(oldPath, newPath));
	}
	await Promise.all(promises);
}

type AddedEntryResourceViteConfigPath = string;

function setAddedEntryResourceViteConfigPath(
	resourceContainerDirPath: string,
	addedEntryResourceName: string,
	addedResources: NameToAddedResource,
): AddedEntryResourceViteConfigPath {
	return join(
		resourceContainerDirPath,
		addedResources[addedEntryResourceName].kebabCase,
		"vite.config.ts",
	);
}

async function updateAddedEntryResourceViteConfigEnvVars(
	addedEntryResourceViteConfigPath: AddedEntryResourceViteConfigPath,
	addedEntryResourceName: string,
	addedResources: NameToAddedResource,
) {
	const viteConfigContent = await fs.readFile(
		addedEntryResourceViteConfigPath,
		"utf-8",
	);

	const newEnvVarName = `GAS_${[
		addedResources[addedEntryResourceName].entityGroup,
		addedResources[addedEntryResourceName].entity,
		addedResources[addedEntryResourceName].cloud,
		addedResources[addedEntryResourceName].cloudService,
		addedResources[addedEntryResourceName].descriptor,
	]
		.join("_")
		.toUpperCase()}_PORT`;

	const updatedViteConfigContent = viteConfigContent.replace(
		/process\.env\.VITE_SERVER_PORT/g,
		`process.env.${newEnvVarName}`,
	);

	await fs.writeFile(
		addedEntryResourceViteConfigPath,
		updatedViteConfigContent,
	);
}

type AddedResourceNpmInstallCommands = string[];

function setAddedResourceNpmInstallCommands(
	addedResources: NameToAddedResource,
	addedEntryResourceName: string,
	addedApiResourceName: string,
	addedDbResourceName: string,
): AddedResourceNpmInstallCommands {
	const res: AddedResourceNpmInstallCommands = [];

	const cmdBase = "npm install --no-fund --no-audit";

	const addedEntryResource = addedResources[addedEntryResourceName];
	const addedApiResource = addedResources[addedApiResourceName];
	const addedDbResource = addedResources[addedDbResourceName];

	if (
		addedEntryResource.cloud === "cf" &&
		addedEntryResource.cloudService === "worker" &&
		addedEntryResource.descriptor === "site" &&
		addedApiResourceName
	) {
		res.push(
			`${cmdBase} ${addedApiResource.kebabCase}@0.0.0 --save-exact -w ${addedEntryResource.kebabCase}`,
		);
	}

	if (
		addedEntryResource.cloud === "cf" &&
		addedEntryResource.cloudService === "worker" &&
		addedEntryResource.descriptor === "api" &&
		addedDbResourceName
	) {
		res.push(
			`${cmdBase} ${addedDbResource.kebabCase}@0.0.0 --save-exact -w ${addedEntryResource.kebabCase}`,
		);
	}

	if (addedApiResourceName && addedDbResourceName) {
		res.push(
			`${cmdBase} ${addedDbResource.kebabCase}@0.0.0 --save-exact -w ${addedApiResource.kebabCase}`,
		);
	}

	return res;
}

async function runAddedResourceNpmInstallCommands(
	resourceNpmInstallCommands: AddedResourceNpmInstallCommands,
): Promise<void> {
	console.log("Installing resources...");
	try {
		const installPromises = resourceNpmInstallCommands.map((command) =>
			exec(command),
		);
		const results = await Promise.all(installPromises);

		results.forEach(({ stdout, stderr }, index) => {
			console.log(`Output for command: ${resourceNpmInstallCommands[index]}`);
			console.log(stdout);
			if (stderr) {
				console.error(stderr);
			}
		});

		console.log("All resources installed successfully.");
	} catch (error) {
		console.error("Error installing resources:", error);
	}
}

type AddedResourceNameToDependencies = {
	[name: string]: string[];
};

function setAddedResourceNameToDependencies(
	nameToAddedResource: NameToAddedResource,
	addedEntryResourceName: string,
	addedApiResourceName: string,
	addedDbResourceName: string,
): AddedResourceNameToDependencies {
	const res: AddedResourceNameToDependencies = {};

	const addedEntryResource = nameToAddedResource[addedEntryResourceName];

	res[addedEntryResourceName] = [];
	if (addedApiResourceName) res[addedApiResourceName] = [];
	if (addedDbResourceName) res[addedDbResourceName] = [];

	if (
		addedEntryResource.cloud === "cf" &&
		addedEntryResource.cloudService === "worker" &&
		addedEntryResource.descriptor === "site" &&
		addedApiResourceName
	) {
		res[addedEntryResourceName].push(addedApiResourceName);
	}

	if (
		addedEntryResource.cloud === "cf" &&
		addedEntryResource.cloudService === "worker" &&
		addedEntryResource.descriptor === "api" &&
		addedDbResourceName
	) {
		res[addedEntryResourceName].push(addedDbResourceName);
	}

	if (addedApiResourceName && addedDbResourceName) {
		res[addedApiResourceName].push(addedDbResourceName);
	}

	return res;
}

async function updateAddedResourceIndexFiles(
	nameToAddedResource: NameToAddedResource,
	addedResourceNameToDependencies: AddedResourceNameToDependencies,
	addedApiResourceName: string,
) {
	const promises: Promise<void>[] = [];

	for (const name in nameToAddedResource) {
		const mod = await loadFile(nameToAddedResource[name].indexFilePath);

		const ast = mod.exports.$ast;

		mod.exports.entityGroupEntityCloudCloudServiceDescriptor.$args[0].name =
			name;

		// Note:
		// The ast types aren't working correctly. Thus,
		// @ts-ignore. In a demo, where magicast is used in a
		// plain .js file, and with the same version, ast is
		// correctly typed as having a body method. The reason
		// for this discrepancy is unknown.
		// @ts-ignore
		const exportDeclaration = ast.body.find(
			(node: any) =>
				node.type === "ExportNamedDeclaration" &&
				node.declaration?.type === "VariableDeclaration" &&
				node.declaration.declarations[0]?.id.type === "Identifier" &&
				node.declaration.declarations[0].id.name ===
					"entityGroupEntityCloudCloudServiceDescriptor",
		);

		if (exportDeclaration?.declaration.declarations[0]) {
			exportDeclaration.declaration.declarations[0].id.name =
				nameToAddedResource[name].camelCase;
		} else {
			console.log("export config const not found in the file");
		}

		for (const dependencyName of addedResourceNameToDependencies[name]) {
			mod.imports.$append({
				from: nameToAddedResource[dependencyName].kebabCase,
				imported: nameToAddedResource[dependencyName].camelCase,
			});

			const params = mod.exports[nameToAddedResource[name].camelCase].$args[0];

			if (
				nameToAddedResource[name].cloud === "cf" &&
				nameToAddedResource[name].cloudService === "worker" &&
				nameToAddedResource[name].descriptor === "site" &&
				addedApiResourceName
			) {
				mod.imports.$append({
					from: "@gasdotdev/resources",
					imported: "ServiceFetcherBindings",
				});

				if (!params.services) {
					params.services = [];
					params.services.push({
						binding: builders.raw(
							`${nameToAddedResource[dependencyName].camelCase}.name`,
						),
					});
				}
			}
		}

		// Note:
		// There are issues with line breaks and spacing in
		// Magicast's generated code.
		// - Imports and config function parameters have unecessary
		// line breaks between them.
		// - Named import specifiers lack spacing.
		// Line break and simple spacing issues can be fixed by pre-processing
		// the code before saving.
		// Complex spacing issues can be fixed by running a formatter like
		// Prettier or Biome after save.
		// It's not clear if these issues are preventable using Magicast.
		// Can the issues be prevented by providing proper inputs to Magicast,
		// is it a fixable bug in Magicast, and/or is this "just how it is"?

		let { code } = generateCode(mod);

		// Remove line breaks between imports.
		code = code.replace(/import [^;]+;\n\nimport [^;]+;/g, (match) =>
			match.replace(/\n\n/g, "\n"),
		);

		// Add spacing to import specifiers between {}.
		code = code.replace(
			/import\s*{\s*([^}]+)\s*}\s*from\s*["']([^"']+)["'];/g,
			(match, importSpecifier, modulePath) => {
				// importSpecifiers is the content inside the curly braces
				// modulePath is the path of the module being imported
				return `import { ${importSpecifier.trim()} } from "${modulePath}";`;
			},
		);

		// Remove empty line breaks after commas.
		code = code.replace(/,\n\n/g, ",\n");

		for (const depName of addedResourceNameToDependencies[name]) {
			if (
				nameToAddedResource[name].cloud === "cf" &&
				nameToAddedResource[name].cloudService === "worker" &&
				nameToAddedResource[name].descriptor === "site" &&
				addedApiResourceName
			) {
				code = code.replace(
					"type Env = {}",
					`type Env = ServiceFetcherBindings<(typeof ${nameToAddedResource[name].camelCase})["services"]>`,
				);
			}
		}

		await fs.writeFile(nameToAddedResource[name].indexFilePath, code);
	}

	return await Promise.all(promises);
}

async function runConfirmInstallPackages() {
	return await confirm({
		message: "Install packages?",
	});
}

const exec = util.promisify(execCallback);

async function installPackages(): Promise<void> {
	console.log("Installing packages...");

	return new Promise((resolve, reject) => {
		const npmInstall = spawn("npm", ["install", "--verbose"], {
			stdio: ["inherit", "pipe", "pipe"],
		});

		npmInstall.stdout.on("data", (data) => {
			const output = data.toString().trim();
			if (output.includes("npm http fetch") && output.includes("GET")) {
				const packageInfo = output.split(" ").pop();
				console.log(`Fetching ${packageInfo}...`);
			} else if (output.includes("added")) {
				console.log(output);
			}
		});

		npmInstall.stderr.on("data", (data) => {
			process.stderr.write(data);
		});

		npmInstall.on("close", (code) => {
			if (code === 0) {
				console.log("All packages installed successfully.");
				resolve();
			} else {
				console.error(`npm install process exited with code ${code}`);
				reject(new Error(`npm install failed with code ${code}`));
			}
		});

		npmInstall.on("error", (err) => {
			console.error("Error installing packages:", err);
			reject(err);
		});
	});
}

async function runPrettier(nameToAddedResource: NameToAddedResource) {
	console.log("Running Prettier on added resources...");
	const prettierPromises = Object.values(nameToAddedResource).map(
		async (resource) => {
			const dirPath = dirname(resource.indexFilePath);
			try {
				await exec("npm run format", { cwd: dirPath });
				console.log(`Prettier formatting completed for ${resource.kebabCase}`);
			} catch (error) {
				console.error(
					`Error running Prettier on ${resource.kebabCase}:`,
					error,
				);
				throw error;
			}
		},
	);

	await Promise.all(prettierPromises);
	console.log("Prettier formatting completed for all resources.");
}

async function newGraph(
	config: Config,
	resources: Resources,
	resourceTemplates: ResourceTemplates,
) {
	const nameToAddedResources: NameToAddedResource = {};

	const addedEntryResourceTemplateKey =
		await runSelectEntryResourcePrompt(resourceTemplates);

	const addedEntryResourceTemplate =
		resourceTemplates[addedEntryResourceTemplateKey];

	let addedEntryResourceEntityGroup = "";

	if (addedEntryResourceTemplate.category === "web") {
		addedEntryResourceEntityGroup = "web";
	} else if (addedEntryResourceTemplate.category === "api") {
		addedEntryResourceEntityGroup = await runSelectApiEntityGroupPrompt(
			resources.nameToFiles,
		);

		if (addedEntryResourceEntityGroup === "new") {
			addedEntryResourceEntityGroup = await runInputApiEntityGroupPrompt();
		}
	}

	addedEntryResourceEntityGroup === "web" &&
		console.log(
			`${colors.green("✔")} ${colors.bold("Entity group set to web")}`,
		);

	let addedEntryResourceEntity = "";

	if (
		addedEntryResourceEntityGroup &&
		addedEntryResourceTemplate.category === "web"
	) {
		addedEntryResourceEntity = await runInputWebEntityPrompt();
	} else if (
		addedEntryResourceEntityGroup &&
		addedEntryResourceTemplate.category === "api"
	) {
		addedEntryResourceEntity = await runSelectApiEntityPrompt(
			resources.nameToFiles,
		);

		if (addedEntryResourceEntity === "new") {
			addedEntryResourceEntity = await runInputApiEntityPrompt();
		}
	}

	const addedEntryResourceName = convertObjectToCapitalSnakeCase({
		entityGroup: addedEntryResourceEntityGroup,
		entity: addedEntryResourceEntity,
		cloud: addedEntryResourceTemplate.cloud,
		cloudService: addedEntryResourceTemplate.cloudService,
		descriptor: addedEntryResourceTemplate.descriptor,
	});

	nameToAddedResources[addedEntryResourceName] = setAddedResource({
		name: addedEntryResourceName,
		entityGroup: addedEntryResourceEntityGroup,
		entity: addedEntryResourceEntity,
		cloud: addedEntryResourceTemplate.cloud,
		cloudService: addedEntryResourceTemplate.cloudService,
		descriptor: addedEntryResourceTemplate.descriptor,
		templateKey: addedEntryResourceTemplateKey,
		resourceContainerDir: config.containerDirPath,
	});

	let addedApiResourceTemplateKey: keyof ResourceTemplates = "skip";

	if (addedEntryResourceTemplate.category === "web") {
		addedApiResourceTemplateKey =
			await runSelectApiResourcePrompt(resourceTemplates);
	}

	const addedApiResourceTemplate = addedApiResourceTemplateKey
		? resourceTemplates[addedApiResourceTemplateKey]
		: undefined;

	let addedApiResourceEntityGroup = "";

	if (addedApiResourceTemplateKey !== "skip") {
		addedApiResourceEntityGroup = await runSelectApiEntityGroupPrompt(
			resources.nameToFiles,
		);

		if (addedApiResourceEntityGroup === "new") {
			addedApiResourceEntityGroup = await runInputApiEntityGroupPrompt();
		}
	}

	let addedApiResourceEntity = "";
	let addedApiResourceName = "";

	if (addedApiResourceEntityGroup) {
		addedApiResourceEntity = await runSelectApiEntityPrompt(
			resources.nameToFiles,
		);

		if (addedApiResourceEntity === "new") {
			addedApiResourceEntity = await runInputApiEntityPrompt();
		}

		addedApiResourceName = convertObjectToCapitalSnakeCase({
			entityGroup: addedApiResourceEntityGroup,
			entity: addedApiResourceEntity,
			cloud: addedApiResourceTemplate!.cloud,
			cloudService: addedApiResourceTemplate!.cloudService,
			descriptor: addedApiResourceTemplate!.descriptor,
		});

		nameToAddedResources[addedApiResourceName] = setAddedResource({
			name: addedApiResourceName,
			entityGroup: addedApiResourceEntityGroup,
			entity: addedApiResourceEntity,
			cloud: addedApiResourceTemplate!.cloud,
			cloudService: addedApiResourceTemplate!.cloudService,
			descriptor: addedApiResourceTemplate!.descriptor,
			templateKey: addedApiResourceTemplateKey,
			resourceContainerDir: config.containerDirPath,
		});
	}

	let addedDbResourceTemplateKey: keyof ResourceTemplates = "skip";

	if (addedApiResourceTemplateKey) {
		addedDbResourceTemplateKey =
			await runSelectDbResourcePrompt(resourceTemplates);
	}

	const addedDbResourceTemplate = addedDbResourceTemplateKey
		? resourceTemplates[addedDbResourceTemplateKey]
		: undefined;

	let addedDbResourceEntityGroup = "";

	if (addedDbResourceTemplateKey !== "skip") {
		addedDbResourceEntityGroup = await runInputEntityGroupPrompt();
	}

	let addedDbResourceEntity = "";
	let addedDbResourceName = "";

	if (addedDbResourceEntityGroup) {
		addedDbResourceEntity = await runInputEntityPrompt();

		addedDbResourceName = convertObjectToCapitalSnakeCase({
			entityGroup: addedDbResourceEntityGroup,
			entity: addedDbResourceEntity,
			cloud: addedDbResourceTemplate!.cloud,
			cloudService: addedDbResourceTemplate!.cloudService,
			descriptor: addedDbResourceTemplate!.descriptor,
		});

		nameToAddedResources[addedDbResourceName] = setAddedResource({
			name: addedDbResourceName,
			entityGroup: addedDbResourceEntityGroup,
			entity: addedDbResourceEntity,
			cloud: addedDbResourceTemplate!.cloud,
			cloudService: addedDbResourceTemplate!.cloudService,
			descriptor: addedDbResourceTemplate!.descriptor,
			templateKey: addedDbResourceTemplateKey,
			resourceContainerDir: config.containerDirPath,
		});
	}

	const __filename = fileURLToPath(import.meta.url);

	const __dirname = dirname(__filename);

	const gigetRemotePath = "github:gasdotdev/gas/templates#master";

	const gigetLocalPath = join(__dirname, "..", "..", ".giget");

	await giget(gigetRemotePath, {
		dir: gigetLocalPath,
		forceClean: true,
	});

	const resourceTemplatesToCopy = setAddedResourceTemplatesToCopy(
		nameToAddedResources,
		config.containerDirPath,
		gigetLocalPath,
	);

	await copyAddedResourceTemplatesFromGigetLocalSrc(resourceTemplatesToCopy);

	const addedResourceNameToPackageJsonPath =
		setAddedResourceNameToPackageJsonPath(
			nameToAddedResources,
			config.containerDirPath,
		);

	const addedResourceNameToPackageJson =
		await setAddedResourceNameToPackageJsons(
			addedResourceNameToPackageJsonPath,
		);

	updateAddedResourcePackageJsons(
		nameToAddedResources,
		addedResourceNameToPackageJson,
	);

	await saveAddedResourcePackageJsons(
		addedResourceNameToPackageJsonPath,
		addedResourceNameToPackageJson,
	);

	const addedResourceNameToIndexFilesToRename =
		setAddedResourceNameToIndexFilesToRename(
			nameToAddedResources,
			config.containerDirPath,
		);

	await renameAddedResourceIndexFiles(addedResourceNameToIndexFilesToRename);

	if (addedEntryResourceTemplateKey === "cloudflare-worker-remix") {
		const addedEntryResourceViteConfigPath =
			setAddedEntryResourceViteConfigPath(
				config.containerDirPath,
				addedEntryResourceName,
				nameToAddedResources,
			);

		await updateAddedEntryResourceViteConfigEnvVars(
			addedEntryResourceViteConfigPath,
			addedEntryResourceName,
			nameToAddedResources,
		);
	}

	const confirmInstallPackages = await runConfirmInstallPackages();

	if (confirmInstallPackages) {
		await installPackages();
	}

	const resourceNpmInstallCommands = setAddedResourceNpmInstallCommands(
		nameToAddedResources,
		addedEntryResourceName,
		addedApiResourceName,
		addedDbResourceName,
	);

	await runAddedResourceNpmInstallCommands(resourceNpmInstallCommands);

	const addedResourceNameToDependencies = setAddedResourceNameToDependencies(
		nameToAddedResources,
		addedEntryResourceName,
		addedApiResourceName,
		addedDbResourceName,
	);

	await updateAddedResourceIndexFiles(
		nameToAddedResources,
		addedResourceNameToDependencies,
		addedApiResourceName,
	);

	await runPrettier(nameToAddedResources);
}

async function existingGraph() {
	//
}

export async function runAdd() {
	let state: State = "select-which";

	const config = await setConfig();

	const resources = await setResources(config.containerDirPath);

	if (Object.keys(resources.nameToConfig).length === 0) {
		state = "new-graph";
	}

	const resourceTemplates = setResourceTemplates();

	const which = await runSelectWhichPrompt();

	state = which === "graph" ? "new-graph" : "existing-graph";

	switch (state) {
		case "new-graph": {
			await newGraph(config, resources, resourceTemplates);
			break;
		}
		case "existing-graph": {
			await existingGraph();
			break;
		}
	}
}
