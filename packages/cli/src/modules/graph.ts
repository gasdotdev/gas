export type GraphGroupToDepthToNodes = Record<number, Record<number, string[]>>;

export type Graph = {
	nameToDeps: Record<string, string[]>;
	nodeToInDegrees: Record<string, number>;
	nodesWithInDegreesOfZero: string[];
	nodeToIntermediates: Record<string, string[]>;
	nodeToGroup: Record<string, number>;
	depthToNode: Record<number, string[]>;
	nodeToDepth: Record<string, number>;
	groupToDepthToNodes: GraphGroupToDepthToNodes;
};

export function setGraph(nameToDeps: Record<string, string[]>): Graph {
	const nodeToInDegrees = setNodeToInDegrees(nameToDeps);
	const nodesWithInDegreesOfZero = setNodesWithInDegreesOfZero(nodeToInDegrees);
	const nodeToIntermediates = setNodeToIntermediates(nameToDeps);
	const nodeToGroup = setNodeToGroup(
		nodesWithInDegreesOfZero,
		nodeToIntermediates,
	);
	const depthToNode = setDepthToNode(nameToDeps, nodesWithInDegreesOfZero);
	const nodeToDepth = setNodeToDepth(depthToNode);
	const groupToDepthToNodes = setGroupToDepthToNodes(nodeToGroup, nodeToDepth);

	return {
		nameToDeps,
		nodeToInDegrees,
		nodesWithInDegreesOfZero,
		nodeToIntermediates,
		nodeToGroup,
		depthToNode,
		nodeToDepth,
		groupToDepthToNodes,
	};
}

// In degrees is how many incoming edges a target node has.
function setNodeToInDegrees(
	nameToDeps: Record<string, string[]>,
): Record<string, number> {
	const nodeToInDegrees: Record<string, number> = {};
	// Loop over nodes and their dependencies.
	for (const deps of Object.values(nameToDeps)) {
		// Increment node's in degrees every time it's
		// found to be a dependency of another resource.
		for (const dep of deps) {
			nodeToInDegrees[dep] = (nodeToInDegrees[dep] || 0) + 1;
		}
	}

	// Ensure all nodes have an entry in nodeToInDegrees
	for (const node of Object.keys(nameToDeps)) {
		// Node has to have an in degree of 0 if it
		// hasn't been placed yet.
		if (!(node in nodeToInDegrees)) {
			nodeToInDegrees[node] = 0;
		}
	}
	return nodeToInDegrees;
}

// Nodes with in degrees of 0 are nodes with no incoming edges.
function setNodesWithInDegreesOfZero(
	nodeToInDegrees: Record<string, number>,
): string[] {
	const nodesWithInDegreesOfZero: string[] = [];
	for (const [node, inDegree] of Object.entries(nodeToInDegrees)) {
		if (inDegree === 0) {
			nodesWithInDegreesOfZero.push(node);
		}
	}
	return nodesWithInDegreesOfZero;
}

function walkDeps(
	node: string,
	nameToDeps: Record<string, string[]>,
	memo: Record<string, string[]>,
): string[] {
	if (node in memo) {
		return memo[node];
	}

	const res: string[] = [];
	const deps = nameToDeps[node] || [];

	for (const dep of deps) {
		if (!res.includes(dep)) {
			res.push(dep);
			for (const transitiveDep of walkDeps(dep, nameToDeps, memo)) {
				if (!res.includes(transitiveDep)) {
					res.push(transitiveDep);
				}
			}
		}
	}

	memo[node] = res;
	return res;
}

// Intermediate nodes are nodes within the source resource's
// directed graph path.

// For example, given a graph of A->B, B->C, and X->C, B and C are
// intermediates of A, C is an intermediate of B, and C is an
// intermediate of X.

// Finding intermediate nodes is necessary for grouping related nodes.
// It wouldn't be possible to know A and X are relatives in
// A->B, B->C, and X->C without them.
function setNodeToIntermediates(
	nameToDeps: Record<string, string[]>,
): Record<string, string[]> {
	const nodeToIntermediates: Record<string, string[]> = {};
	const memo: Record<string, string[]> = {};
	for (const node of Object.keys(nameToDeps)) {
		nodeToIntermediates[node] = walkDeps(node, nameToDeps, memo);
	}
	return nodeToIntermediates;
}

// A group is an integer assigned to nodes that share
// at least one common relative.
function setNodeToGroup(
	nodesWithInDegreesOfZero: string[],
	nodeToIntermediates: Record<string, string[]>,
): Record<string, number> {
	const nodeToGroup: Record<string, number> = {};
	let group = 0;
	for (const sourceNode of nodesWithInDegreesOfZero) {
		if (!(sourceNode in nodeToGroup)) {
			// Initialize source node's group.
			nodeToGroup[sourceNode] = group;

			// Set group for source node's intermediates.
			for (const intermediateNode of nodeToIntermediates[sourceNode] || []) {
				if (!(intermediateNode in nodeToGroup)) {
					nodeToGroup[intermediateNode] = group;
				}
			}

			// Set group for distant relatives of source node.
			// For example, given a graph of A->B, B->C, & X->C,
			// A & X both have an in degrees of 0. When walking the graph
			// downward from their positions, neither will gain knowledge of the
			// other's existence because they don't have incoming edges. To account
			// for that, all nodes with an in degrees of 0 need to be checked
			// with one another to see if they have a common relative (common
			// intermediate nodes in each's direct path). In this case, A & X
			// share a common relative in "C". Therefore, A & X should be assigned
			// to the same group.
			for (const possibleDistantRelativeNode of nodesWithInDegreesOfZero) {
				// Skip source node from the main for loop.
				if (possibleDistantRelativeNode !== sourceNode) {
					// Loop over possible distant relative's intermediates.
					for (const possibleDistantRelativeIntermediateNode of nodeToIntermediates[
						possibleDistantRelativeNode
					] || []) {
						// Check if possible distant relative's intermediate
						// is also an intermediate of source node.
						if (
							nodeToIntermediates[sourceNode]?.includes(
								possibleDistantRelativeIntermediateNode,
							)
						) {
							// If so, possible distant relative and source node
							// are distant relatives and belong to the same group.
							nodeToGroup[possibleDistantRelativeNode] = group;
						}
					}
				}
			}
			group++;
		}
	}
	return nodeToGroup;
}

// Depth is an integer that describes how far down the graph
// a resource is.

// For example, given a graph of A->B, B->C, A has a depth
// of 0, B has a depth of 1, and C has a depth of 2.
function setDepthToNode(
	nameToDeps: Record<string, string[]>,
	nodesWithInDegreesOfZero: string[],
): Record<number, string[]> {
	const depthToNode: Record<number, string[]> = {};
	let numOfNodesToProcess = Object.keys(nameToDeps).length;
	let depth = 0;

	// Process nodes with in-degrees of zero
	for (const nodeWithInDegreesOfZero of nodesWithInDegreesOfZero) {
		if (!depthToNode[depth]) {
			depthToNode[depth] = [];
		}
		depthToNode[depth].push(nodeWithInDegreesOfZero);
		numOfNodesToProcess--;
	}

	// Process remaining nodes
	while (numOfNodesToProcess > 0) {
		const nodesAtCurrentDepth = depthToNode[depth] || [];
		for (const nodeAtDepth of nodesAtCurrentDepth) {
			const depNodes = nameToDeps[nodeAtDepth] || [];
			for (const depNode of depNodes) {
				if (!depthToNode[depth + 1]) {
					depthToNode[depth + 1] = [];
				}
				depthToNode[depth + 1].push(depNode);
				numOfNodesToProcess--;
			}
		}
		depth++;
	}
	return depthToNode;
}

function setNodeToDepth(
	depthToNode: Record<number, string[]>,
): Record<string, number> {
	const nodeToDepth: Record<string, number> = {};
	for (const [depthStr, nodes] of Object.entries(depthToNode)) {
		const depth = Number(depthStr);
		for (const node of nodes) {
			nodeToDepth[node] = depth;
		}
	}
	return nodeToDepth;
}

function setGroupToDepthToNodes(
	nodeToGroup: Record<string, number>,
	nodeToDepth: Record<string, number>,
): GraphGroupToDepthToNodes {
	const groupToDepthToNodes: GraphGroupToDepthToNodes = {};
	for (const [node, group] of Object.entries(nodeToGroup)) {
		if (!(group in groupToDepthToNodes)) {
			groupToDepthToNodes[group] = {};
		}

		const depth = nodeToDepth[node];

		if (!(depth in groupToDepthToNodes[group])) {
			groupToDepthToNodes[group][depth] = [];
		}

		groupToDepthToNodes[group][depth].push(node);
	}
	return groupToDepthToNodes;
}
