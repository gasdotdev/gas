import { createActor, fromCallback, sendTo, setup, waitFor } from "xstate";
import { setConfig } from "../modules/config.js";
import type { GraphGroupToDepthToNodes } from "../modules/graph.js";
import {
	type ResourceNameToDependencies,
	type ResourceNameToDeployState,
	type ResourcesWithUp,
	type UpResources,
	setResourcesWithUp,
} from "../modules/resources.js";
import "dotenv/config";
import { cloudflareWorkersUploadVersion } from "../modules/cloudflare.js";

let resourcesWithUp = {} as ResourcesWithUp;

type ResourceNameToDeployOutput = {
	[name: string]: Record<string, unknown>;
};

const resourceNameToDeployOutput: ResourceNameToDeployOutput = {};

async function processCloudflareWorker(
	resourcesWithUp: ResourcesWithUp,
	resourceName: string,
): Promise<void> {
	switch (resourcesWithUp.nameToState[resourceName]) {
		case "CREATED": {
			const res = await cloudflareWorkersUploadVersion();
			resourceNameToDeployOutput[resourceName] = res;
			break;
		}
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
		nameToDeployState: ResourceNameToDeployState,
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
						nameToDeployState[resourceNameAtDepthToCheck] === "PENDING" &&
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
			if (resourcesWithUp.nameToDeployState[resourceName] !== "UNCHANGED") {
				res++;
			}
		}
		return res;
	}

	function setNameToStatePendingAsCanceled() {
		for (const name in resourcesWithUp.nameToDeployState) {
			if (resourcesWithUp.nameToDeployState[name] === "PENDING") {
				resourcesWithUp.nameToDeployState[name] = "CANCELED";
			}
		}
	}

	function checkIfResourceIsDependentOnOneDeploying(name: string) {
		const dependencies = resourcesWithUp.nameToDependencies[name];
		for (const dependencyName of dependencies) {
			if (
				resourcesWithUp.nameToDeployState[dependencyName] ===
					"CREATE_IN_PROGRESS" ||
				resourcesWithUp.nameToDeployState[dependencyName] ===
					"DELETE_IN_PROGRESS" ||
				resourcesWithUp.nameToDeployState[dependencyName] === "PENDING" ||
				resourcesWithUp.nameToDeployState[dependencyName] ===
					"UPDATE_IN_PROGRESS"
			) {
				return true;
			}
		}
		return false;
	}

	function setNameToDeployStateAsInProgress(name: string) {
		switch (resourcesWithUp.nameToState[name]) {
			case "CREATED":
				resourcesWithUp.nameToDeployState[name] = "CREATE_IN_PROGRESS";
				break;
			case "DELETED":
				resourcesWithUp.nameToDeployState[name] = "DELETE_IN_PROGRESS";
				break;
			case "UPDATED":
				resourcesWithUp.nameToDeployState[name] = "UPDATE_IN_PROGRESS";
				break;
		}
	}

	function setNameToDeployStateAsComplete(name: string) {
		switch (resourcesWithUp.nameToDeployState[name]) {
			case "CREATE_IN_PROGRESS":
				resourcesWithUp.nameToDeployState[name] = "CREATE_COMPLETE";
				break;
			case "DELETE_IN_PROGRESS":
				resourcesWithUp.nameToDeployState[name] = "DELETE_COMPLETE";
				break;
			case "UPDATE_IN_PROGRESS":
				resourcesWithUp.nameToDeployState[name] = "UPDATE_COMPLETE";
				break;
		}
	}

	function setNameToDeployStateAsFailed(name: string) {
		switch (resourcesWithUp.nameToDeployState[name]) {
			case "CREATE_IN_PROGRESS":
				resourcesWithUp.nameToDeployState[name] = "CREATE_FAILED";
				break;
			case "DELETE_IN_PROGRESS":
				resourcesWithUp.nameToDeployState[name] = "DELETE_FAILED";
				break;
			case "UPDATE_IN_PROGRESS":
				resourcesWithUp.nameToDeployState[name] = "UPDATE_FAILED";
				break;
		}
	}

	function logNameToDeployState(name: string, group: number, depth: number) {
		const now = new Date();
		const hours = now.getHours().toString().padStart(2, "0");
		const minutes = now.getMinutes().toString().padStart(2, "0");
		const seconds = now.getSeconds().toString().padStart(2, "0");
		const formattedTime = `${hours}:${minutes}:${seconds}`;

		console.log(
			`[${formattedTime}] Group ${group} -> Depth ${depth} -> ${name} -> ${resourcesWithUp.nameToDeployState[name]}`,
		);
	}

	const highestGroupDeployDepth =
		resourcesWithUp.groupToHighestDeployDepth[group];

	const initialNamesToDeploy = setInitialNamesToDeploy(
		highestGroupDeployDepth,
		group,
		resourcesWithUp.groupToDepthToNames,
		resourcesWithUp.nameToDependencies,
		resourcesWithUp.nameToDeployState,
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
				setNameToDeployStateAsInProgress(event.name);

				logNameToDeployState(
					event.name,
					group,
					resourcesWithUp.nameToDepth[event.name],
				);

				try {
					const resourceProcessor =
						resourceProcessors[
							resourcesWithUp.nameToConfigData[event.name]
								.functionName as keyof typeof resourceProcessors
						];

					const res = await resourceProcessor(resourcesWithUp, event.name);

					setNameToDeployStateAsComplete(event.name);

					logNameToDeployState(
						event.name,
						group,
						resourcesWithUp.nameToDepth[event.name],
					);

					sendBack({
						type: "PROCESS_RESOURCE_DONE_OK",
						name: event.name,
					});
				} catch (err) {
					setNameToDeployStateAsFailed(event.name);

					logNameToDeployState(
						event.name,
						group,
						resourcesWithUp.nameToDepth[event.name],
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
						numOfNamesDeployedOk++;
						break;
					case "PROCESS_RESOURCE_DONE_ERR":
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
						if (resourcesWithUp.nameToDeployState[name] === "PENDING") {
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
						`Group ${group} -> Depth ${depth} -> ${name} -> ${resourcesWithUp.nameToDeployState[name]}`,
					);
				}
			}
		}
	}

	function setNameToDeployStateAsPending() {
		for (const name in resourcesWithUp.nameToDeployState) {
			if (resourcesWithUp.nameToDeployState[name] !== "UNCHANGED") {
				resourcesWithUp.nameToDeployState[name] = "PENDING";
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
						sendBack({ type: "PROCESS_GROUPS_DONE_ERR" });
					} else {
						sendBack({ type: "PROCESS_GROUPS_DONE_OK" });
					}
				}
			});
		}
	});

	logPreDeployNameToState();

	setNameToDeployStateAsPending();

	return setup({
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

	resourcesWithUp = await setResourcesWithUp(
		config.containerDirPath,
		config.upJsonPath,
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

	const deployedUpResources: UpResources = {};

	for (const name in resourceNameToDeployOutput) {
		deployedUpResources[name] = {
			config: resourcesWithUp.nameToConfig[name],
			dependencies: resourcesWithUp.nameToDependencies[name],
			output: resourceNameToDeployOutput[name],
		};
	}

	const newUpResourcesJson: UpResources = {
		...resourcesWithUp.upResources,
		...deployedUpResources,
	};

	console.log("new up resources json");

	console.log(JSON.stringify(newUpResourcesJson, null, 2));
}
