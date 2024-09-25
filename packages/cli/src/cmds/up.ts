import { createActor, fromCallback, setup, waitFor } from "xstate";
import { setConfig } from "../modules/config.js";
import {
	type ResourcesWithUp,
	setResourcesWithUp,
} from "../modules/resources.js";
import { setUpResources } from "../modules/up-resources.js";

let resourcesWithUp = {} as ResourcesWithUp;

function setGroupDeployMachine() {
	const processor = fromCallback(({ sendBack }) => {
		setTimeout(() => {
			sendBack({ type: "OK" });
		}, 1000);
	});

	return setup({
		actors: {
			processor,
		},
	}).createMachine({
		id: "group",
		initial: "processingGroup",
		states: {
			processingGroup: {
				invoke: {
					src: "processor",
				},
				on: {
					OK: {
						target: "ok",
					},
					ERROR: {
						target: "error",
					},
				},
			},
			ok: { type: "final" },
			error: { type: "final" },
		},
	});
}

function logPreDeployNameToState() {
	console.log("# Pre-Deploy States:");
	for (const group in resourcesWithUp.groupToDepthToNames) {
		for (const depth in resourcesWithUp.groupToDepthToNames[group]) {
			for (const name of resourcesWithUp.groupToDepthToNames[group][depth]) {
				console.log(
					`Group ${group} -> Depth ${depth} -> ${name} -> ${resourcesWithUp.nameToState[name]}`,
				);
			}
		}
	}
}

function setNameToDeployStateOfPending() {
	for (const name in resourcesWithUp.nameToState) {
		if (resourcesWithUp.nameToState[name] !== "UNCHANGED") {
			resourcesWithUp.nameToState[name] = "PENDING";
		}
	}
}

function setRootDeployMachine() {
	return setup({
		actions: {
			logPreDeployNameToState,
			setNameToDeployStateOfPending,
		},
	}).createMachine({
		id: "root",
		initial: "logPreDeployNameToState",
		states: {
			logPreDeployNameToState: {
				entry: [
					{
						type: "logPreDeployNameToState",
					},
					{
						type: "setNameToDeployStateOfPending",
					},
				],
				always: {
					target: "ok",
				},
			},
			processingGroups: {},
			ok: { type: "final" },
			error: { type: "final" },
		},
	});
}

export async function runUp() {
	const config = await setConfig();

	const upResources = await setUpResources(config.upJsonPath);

	resourcesWithUp = await setResourcesWithUp(
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

	console.log(JSON.stringify(resourcesWithUp, null, 2));

	if (snapshot.value === "error") {
		throw new Error("Unable to deploy resources");
	}
}
