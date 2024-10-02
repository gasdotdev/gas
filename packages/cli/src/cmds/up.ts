import { createActor, fromCallback, sendTo, setup, waitFor } from "xstate";
import { setConfig } from "../modules/config.js";
import type { GraphGroupToDepthToNodes } from "../modules/graph.js";
import {
	type ResourceNameToDependencies,
	type ResourceNameToState,
	type ResourcesWithUp,
	setResourcesWithUp,
} from "../modules/resources.js";
import { setUpResources } from "../modules/up-resources.js";

let resourcesWithUp = {} as ResourcesWithUp;

type ResourceNameToResult = {
	[name: string]: unknown;
};

const resourceNameToResult: ResourceNameToResult = {};

async function processCloudflareWorker(
	resourcesWithUp: ResourcesWithUp,
	resourceNameToResult: ResourceNameToResult,
	resourceName: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		switch (resourcesWithUp.nameToState[resourceName]) {
			case "CREATED":
				setTimeout(() => {
					resolve();
				}, 2500);
				break;
			case "DELETED":
				break;
			case "UPDATED":
				break;
		}
	});
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
		const res: InitialGroupNamesToDeploy = [];

		// Add every resource at highest deploy depth containing
		// a resource to deploy.
		res.push(
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
						!res.includes(dependencyName)
					) {
						res.push(resourceNameAtDepthToCheck);
					}
				}
			}
			depthToCheck--;
		}

		return res;
	}

	type NumToDeploy = number;

	function setNumToDeploy(group: number): NumToDeploy {
		let res = 0;
		for (const resourceName of resourcesWithUp.groupToNames[group]) {
			if (resourcesWithUp.nameToState[resourceName] !== "UNCHANGED") {
				res++;
			}
		}
		return res;
	}

	function setNameToStatePendingAsCanceled() {
		for (const name in resourcesWithUp.nameToState) {
			if (resourcesWithUp.nameToState[name] === "PENDING") {
				resourcesWithUp.nameToState[name] = "CANCELED";
			}
		}
	}

	function checkIfResourceIsDependentOnOneDeploying(name: string) {
		const dependencies = resourcesWithUp.nameToDependencies[name];
		for (const dependencyName of dependencies) {
			if (
				resourcesWithUp.nameToState[dependencyName] === "CREATE_IN_PROGRESS" ||
				resourcesWithUp.nameToState[dependencyName] === "DELETE_IN_PROGRESS" ||
				resourcesWithUp.nameToState[dependencyName] === "PENDING" ||
				resourcesWithUp.nameToState[dependencyName] === "UPDATE_IN_PROGRESS"
			) {
				return true;
			}
		}
		return false;
	}

	function setNameToStateAsInProgress(name: string) {
		switch (resourcesWithUp.nameToState[name]) {
			case "CREATED":
				resourcesWithUp.nameToState[name] = "CREATE_IN_PROGRESS";
				break;
			case "DELETED":
				resourcesWithUp.nameToState[name] = "DELETE_IN_PROGRESS";
				break;
			case "UPDATED":
				resourcesWithUp.nameToState[name] = "UPDATE_IN_PROGRESS";
				break;
		}
	}

	function setNameToStateAsComplete(name: string) {
		switch (resourcesWithUp.nameToState[name]) {
			case "CREATE_IN_PROGRESS":
				resourcesWithUp.nameToState[name] = "CREATE_COMPLETE";
				break;
			case "DELETE_IN_PROGRESS":
				resourcesWithUp.nameToState[name] = "DELETE_COMPLETE";
				break;
			case "UPDATE_IN_PROGRESS":
				resourcesWithUp.nameToState[name] = "UPDATE_COMPLETE";
				break;
		}
	}

	function setNameToStateAsFailed(name: string) {
		switch (resourcesWithUp.nameToState[name]) {
			case "CREATE_IN_PROGRESS":
				resourcesWithUp.nameToState[name] = "CREATE_FAILED";
				break;
			case "DELETE_IN_PROGRESS":
				resourcesWithUp.nameToState[name] = "DELETE_FAILED";
				break;
			case "UPDATE_IN_PROGRESS":
				resourcesWithUp.nameToState[name] = "UPDATE_FAILED";
				break;
		}
	}

	function logNameToState(
		name: string,
		group: number,
		depth: number,
		timestamp: number,
	) {
		const date = new Date(timestamp * 1000);
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		const seconds = date.getSeconds().toString().padStart(2, "0");
		const formattedTime = `${hours}:${minutes}:${seconds}`;

		console.log(
			`[${formattedTime}] Group ${group} -> Depth ${depth} -> ${name} -> ${resourcesWithUp.nameToState[name]}`,
		);
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

	let numOfNamesDeployedOk = 0;
	let numOfNamesDeployedErr = 0;
	const numOfNamesDeployedCanceled = 0;

	type ProcessResourceStartEvent = {
		type: "PROCESS_RESOURCE_START";
		name: string;
	};

	type ProcessResourceDoneOkEvent = {
		type: "PROCESS_RESOURCE_DONE_OK";
		name: string;
	};

	type ProcessResourceDoneErrEvent = {
		type: "PROCESS_RESOURCE_DONE_ERR";
		name: string;
	};

	const processResourceEvent = fromCallback(
		({
			receive,
			sendBack,
		}: {
			receive: (cb: (event: ProcessResourceStartEvent) => void) => void;
			sendBack: (
				event: ProcessResourceDoneOkEvent | ProcessResourceDoneErrEvent,
			) => void;
		}) => {
			receive(async (event) => {
				console.log("Received processResourceStartEvent", event);

				setNameToStateAsInProgress(event.name);

				let timestamp = Date.now();

				logNameToState(
					event.name,
					group,
					resourcesWithUp.nameToDepth[event.name],
					timestamp,
				);

				console.log(
					"Processing resource",
					resourcesWithUp.nameToConfigData[event.name].functionName,
				);

				try {
					const resourceProcessor =
						resourceProcessors[
							resourcesWithUp.nameToConfigData[event.name]
								.functionName as keyof typeof resourceProcessors
						];

					console.log("Resource processor", resourceProcessor);

					const res = await resourceProcessor(
						resourcesWithUp,
						resourceNameToResult,
						event.name,
					);

					console.log("Resource processor result", res);

					setNameToStateAsComplete(event.name);

					timestamp = Date.now();

					logNameToState(
						event.name,
						group,
						resourcesWithUp.nameToDepth[event.name],
						timestamp,
					);

					sendBack({
						type: "PROCESS_RESOURCE_DONE_OK",
						name: event.name,
					});
				} catch (err) {
					setNameToStateAsFailed(event.name);

					timestamp = Date.now();

					logNameToState(
						event.name,
						group,
						resourcesWithUp.nameToDepth[event.name],
						timestamp,
					);

					sendBack({
						type: "PROCESS_RESOURCE_DONE_ERR",
						name: event.name,
					});
				}
			});
		},
	);

	const processResourceDoneEvent = fromCallback(
		({
			receive,
			sendBack,
		}: {
			receive: (
				cb: (
					event: ProcessResourceDoneOkEvent | ProcessResourceDoneErrEvent,
				) => void,
			) => void;
			sendBack: (
				event:
					| ProcessResourceStartEvent
					| ProcessGroupDoneOkEvent
					| ProcessGroupDoneErrEvent,
			) => void;
		}) => {
			receive((event) => {
				switch (event.type) {
					case "PROCESS_RESOURCE_DONE_OK":
						console.log("Received processResourceDoneOkEvent", event);
						numOfNamesDeployedOk++;
						break;
					case "PROCESS_RESOURCE_DONE_ERR":
						console.log("Received processResourceDoneErrEvent", event);
						numOfNamesDeployedErr++;
						if (numOfNamesDeployedCanceled === 0) {
							// Cancel PENDING resources.
							// Check for 0 because resources should only
							// be canceled one time.
							setNameToStatePendingAsCanceled();
						}
						break;
					default: {
						const never: never = event;
						throw new Error(`Invalid processResourceDoneEvent: ${never}`);
					}
				}

				const numOfNamesInFinalDeployState =
					numOfNamesDeployedOk +
					numOfNamesDeployedErr +
					numOfNamesDeployedCanceled;

				if (numOfNamesInFinalDeployState === numOfNamesInGroupToDeploy) {
					if (numOfNamesDeployedErr === 0) {
						sendBack({ type: "PROCESS_GROUP_DONE_OK" });
					} else {
						sendBack({ type: "PROCESS_GROUP_DONE_ERR" });
					}
				} else {
					for (const name of resourcesWithUp.groupToNames[group]) {
						if (resourcesWithUp.nameToState[name] === "PENDING") {
							let deployResource = true;

							const isResourceDependentOnOneDeploying =
								checkIfResourceIsDependentOnOneDeploying(name);

							if (isResourceDependentOnOneDeploying) {
								deployResource = false;
							}

							if (deployResource) {
								sendBack({
									type: "PROCESS_RESOURCE_START",
									name,
								} as ProcessResourceStartEvent);
							}
						}
					}
				}
			});
		},
	);

	type ProcessGroupDoneOkEvent = { type: "PROCESS_GROUP_DONE_OK" };
	type ProcessGroupDoneErrEvent = { type: "PROCESS_GROUP_DONE_ERR" };

	return setup({
		types: {
			events: {} as
				| ProcessResourceStartEvent
				| ProcessResourceDoneOkEvent
				| ProcessResourceDoneErrEvent
				| ProcessGroupDoneOkEvent
				| ProcessGroupDoneErrEvent,
		},
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
						type: "PROCESS_RESOURCE_START",
						name,
					} as ProcessResourceStartEvent),
				),
				on: {
					PROCESS_RESOURCE_START: {
						actions: [
							sendTo(
								"processResourceEvent",
								({ event }) => event as ProcessResourceStartEvent,
							),
						],
					},
					PROCESS_RESOURCE_DONE_OK: {
						actions: [
							sendTo(
								"processResourceDoneEvent",
								({ event }) => event as ProcessResourceDoneOkEvent,
							),
						],
					},
					PROCESS_RESOURCE_DONE_ERR: {
						actions: [
							sendTo(
								"processResourceDoneEvent",
								({ event }) => event as ProcessResourceDoneErrEvent,
							),
						],
					},
					PROCESS_GROUP_DONE_OK: {
						target: "ok",
					},
					PROCESS_GROUP_DONE_ERR: {
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
						sendBack({ type: "PROCESS_GROUPS_DONE_ERR" });
					} else {
						sendBack({ type: "PROCESS_GROUPS_DONE_OK" });
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
					PROCESS_GROUPS_DONE_OK: {
						target: "ok",
					},
					PROCESS_GROUPS_DONE_ERR: {
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
