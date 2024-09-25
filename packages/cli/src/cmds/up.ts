import { createActor, setup, waitFor } from "xstate";
import { setConfig } from "../modules/config.js";
import {
	type ResourceGroupToDepthToNames,
	type ResourceNameToState,
	setResourcesWithUp,
} from "../modules/resources.js";
import { setUpResources } from "../modules/up-resources.js";

function setGroupDeployMachine() {
	return setup({}).createMachine({
		id: "groupDeploy",
		initial: "ok",
		states: {
			ok: { type: "final" },
			error: { type: "final" },
		},
	});
}

function logPreDeployNameToState(
	groupToDepthToNames: ResourceGroupToDepthToNames,
	nameToState: ResourceNameToState,
) {
	console.log("# Pre-Deploy States:");
	for (const group in groupToDepthToNames) {
		for (const depth in groupToDepthToNames[group]) {
			for (const name of groupToDepthToNames[group][depth]) {
				console.log(
					`Group ${group} -> Depth ${depth} -> ${name} -> ${nameToState[name]}`,
				);
			}
		}
	}
}

function setNameToDeployStateOfPending(nameToState: ResourceNameToState) {
	for (const name in nameToState) {
		if (nameToState[name] !== "UNCHANGED") {
			nameToState[name] = "PENDING";
		}
	}
}

function setRootDeployMachine() {
	return setup({}).createMachine({
		id: "rootDeploy",
		initial: "ok",
		states: {
			ok: { type: "final" },
			error: { type: "final" },
		},
	});
}

export async function runUp() {
	const config = await setConfig();

	const upResources = await setUpResources(config.upJsonPath);

	const resources = await setResourcesWithUp(
		config.containerDirPath,
		upResources,
	);

	const rootMachine = setRootDeployMachine();

	const actor = createActor(rootMachine).start();

	const snapshot = await waitFor(
		actor,
		(snapshot) => snapshot.matches("ok") || snapshot.matches("error"),
		{
			timeout: 3600_000,
		},
	);

	if (snapshot.value === "error") {
		throw new Error("Unable to deploy resources");
	}
}
