import { createActor, fromCallback, sendTo, setup, waitFor } from "xstate";
import { setConfig } from "../modules/config.js";
import type { GraphGroupToDepthToNodes } from "../modules/graph.js";
import {
	type ResourceNameToDependencies,
	type ResourceNameToState,
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

function setGroupDeployMachine(group: number) {
	type InitialGroupNamesToDeploy = string[];

	// Deployments can't only start at the highest depth
	// containing a resource to deploy (i.e. a resource
	// with a deploy state of PENDING).

	// For example, given a graph of:
	// a -> b
	// b -> c
	// c -> d
	// a -> e

	// d has a depth of 3 and e has a depth of 1.

	// If just d and e need to be deployed, the deployment can't start
	// at depth 3 only. e would be blocked until d finished because
	// d has a higher depth than e. That's not optimal. They should
	// be started at the same time and deployed concurrently.
	function setInitialNamesToDeploy(
		highestDepthContainingAResourceToDeploy: number,
		group: number,
		groupToDepthToNames: GraphGroupToDepthToNodes,
		nameToDependencies: ResourceNameToDependencies,
		nameToState: ResourceNameToState,
	): InitialGroupNamesToDeploy {
		const result: InitialGroupNamesToDeploy = [];

		// Add every resource at highest deploy depth containing
		// a resource to deploy.
		result.push(
			...groupToDepthToNames[group][highestDepthContainingAResourceToDeploy],
		);

		// Check all other depths, except 0, for resources that can
		// start deploying on deployment initiation (0 is skipped
		// because a resource at that depth can only be deployed
		// first if it's being deployed in isolation).
		let depthToCheck = highestDepthContainingAResourceToDeploy - 1;
		while (depthToCheck > 0) {
			const resourceNamesAtDepthToCheck =
				groupToDepthToNames[group][depthToCheck];
			for (const resourceNameAtDepthToCheck of resourceNamesAtDepthToCheck) {
				const dependencies = nameToDependencies[resourceNameAtDepthToCheck];
				for (const dependencyName of dependencies) {
					// If resource at depth to check is PENDING and is not
					// dependent on any resource in the ongoing result, then
					// append it to the result.
					if (
						nameToState[resourceNameAtDepthToCheck] === "PENDING" &&
						!result.includes(dependencyName)
					) {
						result.push(resourceNameAtDepthToCheck);
					}
				}
			}
			depthToCheck--;
		}

		return result;
	}

	type NumToDeploy = number;

	function setNumToDeploy(group: number): NumToDeploy {
		let result = 0;
		for (const resourceName of resourcesWithUp.groupToNames[group]) {
			if (resourcesWithUp.nameToState[resourceName] !== "UNCHANGED") {
				result++;
			}
		}
		return result;
	}

	const highestGroupDeployDepth =
		resourcesWithUp.groupToHighestDeployDepth[group];

	const initialNamesToDeploy = setInitialNamesToDeploy(
		highestGroupDeployDepth,
		group,
		resourcesWithUp.groupToDepthToNames,
		resourcesWithUp.nameToDependencies,
		resourcesWithUp.nameToState,
	);

	const numOfNamesInGroupToDeploy = setNumToDeploy(group);

	const numOfNamesDeployedOk = 0;
	const numOfNamesDeployedErr = 0;
	const numOfNamesDeployedCanceled = 0;

	type ProcessResourceStartEvent = {
		type: "processResource";
		name: string;
	};

	type ProcessResoureDoneEvent = {
		type: "PROCESS_RESOURCE_DONE_OK";
		name: string;
	};

	const processResourceEvent = fromCallback(
		({
			receive,
			sendBack,
		}: {
			receive: (cb: (event: ProcessResourceStartEvent) => void) => void;
			sendBack: (event: ProcessResoureDoneEvent) => void;
		}) => {
			receive((event) => {
				console.log("Received processResourceStartEvent", event);
				setTimeout(() => {
					sendBack({
						type: "PROCESS_RESOURCE_DONE_OK",
						name: event.name,
					});
				}, 2500);
			});
		},
	);

	const processResourceDoneEvent = fromCallback(
		({
			receive,
			sendBack,
		}: {
			receive: (cb: (event: ProcessResoureDoneEvent) => void) => void;
			sendBack: (event: { type: string }) => void;
		}) => {
			receive((event) => {
				console.log("Received processResourceDoneEvent", event);
				sendBack({ type: "OK" });
			});
		},
	);

	return setup({
		actors: {
			processResourceEvent,
			processResourceDoneEvent,
		},
	}).createMachine({
		id: "group",
		initial: "processingGroup",
		invoke: [
			{ id: "processResourceEvent", src: "processResourceEvent" },
			{ id: "processResourceDoneEvent", src: "processResourceDoneEvent" },
		],
		states: {
			processingGroup: {
				entry: initialNamesToDeploy.map((name) =>
					sendTo("processResourceEvent", {
						type: "processResource",
						name,
					} as ProcessResourceStartEvent),
				),
				on: {
					PROCESS_RESOURCE_DONE_OK: {
						actions: [
							sendTo(
								"processResourceDoneEvent",
								({ event }) => event as ProcessResoureDoneEvent,
							),
						],
					},
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

	const processGroups = fromCallback(({ sendBack }) => {
		const numOfGroupsToDeploy = resourcesWithUp.groupsWithStateChanges.length;

		let numOfGroupsDeployedWithOk = 0;
		let numOfGroupsDeployedWithErr = 0;

		for (const group of resourcesWithUp.groupsWithStateChanges) {
			const groupDeployMachine = setGroupDeployMachine(group);

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
						console.error("Error deploying resources");
						sendBack({ type: "ERR" });
					} else {
						sendBack({ type: "OK" });
					}
				}
			});
		}
	});

	logPreDeployNameToState();

	setNameToDeployStateOfPending();

	return setup({
		actions: {
			logPreDeployNameToState,
			setNameToDeployStateOfPending,
		},
		actors: {
			processGroups,
		},
	}).createMachine({
		id: "root",
		initial: "processingGroups",
		states: {
			processingGroups: {
				invoke: {
					src: "processGroups",
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
