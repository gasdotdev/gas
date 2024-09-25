import { createActor, setup, waitFor } from "xstate";
import { setConfig } from "../modules/config.js";
import { setResourcesWithUp } from "../modules/resources.js";
import { setUpResources } from "../modules/up-resources.js";

const machine = setup({}).createMachine({
	id: "root",
	initial: "ok",
	states: {
		ok: { type: "final" },
		error: { type: "final" },
	},
});

export async function runUp() {
	const config = await setConfig();

	const upResources = await setUpResources(config.upJsonPath);

	const resources = await setResourcesWithUp(
		config.containerDirPath,
		upResources,
	);

	const actor = createActor(machine).start();

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
