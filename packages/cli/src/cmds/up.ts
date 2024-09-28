import { createActor, fromCallback, setup, waitFor } from "xstate";
import { setConfig } from "../modules/config.js";
import {
	type ResourceState,
	type ResourcesWithUp,
	setResourcesWithUp,
} from "../modules/resources.js";
import { setUpResources } from "../modules/up-resources.js";

let resourcesWithUp = {} as ResourcesWithUp;

type NameToResult = {
	[name: string]: unknown;
};

const nameToResult = {};

async function processCloudflareWorker(
	resourcesWithUp: ResourcesWithUp,
	state: ResourceState,
	nameToResult: NameToResult,
) {
	switch (state) {
		case "CREATED":
			break;
		case "DELETED":
			break;
		case "UPDATED":
			break;
	}
}

const resourceProcessors = {
	cloudflareWorker: processCloudflareWorker,
};

function setGroupDeployMachine() {
	const groupProcessor = fromCallback(({ sendBack }) => {
		setTimeout(() => {
			sendBack({ type: "OK" });
		}, 1000);
	});

	return setup({
		actors: {
			groupProcessor,
		},
	}).createMachine({
		id: "group",
		initial: "processingGroup",
		states: {
			processingGroup: {
				invoke: {
					src: "groupProcessor",
				},
				on: {
					OK: {
						target: "ok",
					},
					ERR: {
						target: "err",
					},
				},
			},
			ok: { type: "final" },
			err: { type: "final" },
		},
	});
}

function setRootDeployMachine() {
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

	const groupsProcessor = fromCallback(({ sendBack }) => {
		const numOfGroupsToDeploy = resourcesWithUp.groupsWithStateChanges.length;

		let numOfGroupsDeployedWithOk = 0;
		let numOfGroupsDeployedWithErr = 0;

		for (const group of resourcesWithUp.groupsWithStateChanges) {
			const groupDeployMachine = setGroupDeployMachine();

			const groupDeployMachineActor = createActor(groupDeployMachine).start();

			groupDeployMachineActor.subscribe((state) => {
				if (state.matches("ok")) {
					numOfGroupsDeployedWithOk++;
				} else if (state.matches("err")) {
					numOfGroupsDeployedWithErr++;
				}

				const numOfGroupsFinishedDeploying =
					numOfGroupsDeployedWithOk + numOfGroupsDeployedWithErr;

				if (numOfGroupsToDeploy === numOfGroupsFinishedDeploying) {
					if (numOfGroupsDeployedWithErr > 0) {
						sendBack({ type: "ERR" });
					} else {
						sendBack({ type: "OK" });
					}
				}
			});
		}
	});

	return setup({
		actions: {
			logPreDeployNameToState,
			setNameToDeployStateOfPending,
		},
		actors: {
			groupsProcessor,
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
					target: "processingGroups",
				},
			},
			processingGroups: {
				invoke: {
					src: "groupsProcessor",
				},
				on: {
					OK: {
						target: "ok",
					},
					ERR: {
						target: "err",
					},
				},
			},
			ok: { type: "final" },
			err: { type: "final" },
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
		(snapshot) => snapshot.matches("ok") || snapshot.matches("err"),
		{
			timeout: 3600_000,
		},
	);

	if (snapshot.value === "err") {
		throw new Error("Unable to deploy resources");
	}
}
