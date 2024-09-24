export type GraphNodeToDependencies = {
	[node: string]: string[];
};

export type GraphNodeToInDegrees = {
	[node: string]: number;
};

export type GraphNodesWithInDegreesOfZero = string[];

export type GraphNodeToIntermediates = {
	[node: string]: string[];
};

export type GraphNodeToGroup = {
	[node: string]: number;
};

export type GraphDepthToNode = {
	[depth: number]: string[];
};

export type GraphNodeToDepth = {
	[node: string]: number;
};

export type GraphGroupToDepthToNodes = {
	[group: number]: {
		[depth: number]: string[];
	};
};

export type Graph = {
	nameToDependencies: GraphNodeToDependencies;
	nodeToInDegrees: GraphNodeToInDegrees;
	nodesWithInDegreesOfZero: GraphNodesWithInDegreesOfZero;
	nodeToIntermediates: GraphNodeToIntermediates;
	nodeToGroup: GraphNodeToGroup;
	depthToNode: GraphDepthToNode;
	nodeToDepth: GraphNodeToDepth;
	groupToDepthToNodes: GraphGroupToDepthToNodes;
};

export function setGraph(nameToDependencies: GraphNodeToDependencies): Graph {
	const nodeToInDegrees = setNodeToInDegrees(nameToDependencies);
	const nodesWithInDegreesOfZero = setNodesWithInDegreesOfZero(nodeToInDegrees);
	const nodeToIntermediates = setNodeToIntermediates(nameToDependencies);
	const nodeToGroup = setNodeToGroup(
		nodesWithInDegreesOfZero,
		nodeToIntermediates,
	);
	const depthToNode = setDepthToNode(
		nameToDependencies,
		nodesWithInDegreesOfZero,
	);
	const nodeToDepth = setNodeToDepth(depthToNode);
	const groupToDepthToNodes = setGroupToDepthToNodes(nodeToGroup, nodeToDepth);

	return {
		nameToDependencies: nameToDependencies,
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
	nameToDependencies: GraphNodeToDependencies,
): GraphNodeToInDegrees {
	const res: GraphNodeToInDegrees = {};
	// Loop over nodes and their dependencies.
	for (const dependencies of Object.values(nameToDependencies)) {
		// Increment node's in degrees every time it's
		// found to be a dependency of another resource.
		for (const dependency of dependencies) {
			res[dependency] = (res[dependency] || 0) + 1;
		}
	}

	// Ensure all nodes have an entry in nodeToInDegrees
	for (const node of Object.keys(nameToDependencies)) {
		// Node has to have an in degree of 0 if it
		// hasn't been placed yet.
		if (!(node in res)) {
			res[node] = 0;
		}
	}
	return res;
}

// Nodes with in degrees of 0 are nodes with no incoming edges.
function setNodesWithInDegreesOfZero(
	nodeToInDegrees: GraphNodeToInDegrees,
): string[] {
	const res: string[] = [];
	for (const [node, inDegree] of Object.entries(nodeToInDegrees)) {
		if (inDegree === 0) {
			res.push(node);
		}
	}
	return res;
}

function walkDependencies(
	node: string,
	nodeToDependencies: GraphNodeToDependencies,
	memo: Record<string, string[]>,
): string[] {
	if (node in memo) {
		return memo[node];
	}

	const res: string[] = [];
	const dependencies = nodeToDependencies[node] || [];

	for (const dependency of dependencies) {
		if (!res.includes(dependency)) {
			res.push(dependency);
			for (const transitiveDep of walkDependencies(
				dependency,
				nodeToDependencies,
				memo,
			)) {
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
	nodeToDependencies: GraphNodeToDependencies,
): GraphNodeToIntermediates {
	const res: GraphNodeToIntermediates = {};
	const memo: Record<string, string[]> = {};
	for (const node of Object.keys(nodeToDependencies)) {
		res[node] = walkDependencies(node, nodeToDependencies, memo);
	}
	return res;
}

// A group is an integer assigned to nodes that share
// at least one common relative.
function setNodeToGroup(
	nodesWithInDegreesOfZero: string[],
	nodeToIntermediates: GraphNodeToIntermediates,
): GraphNodeToGroup {
	const res: GraphNodeToGroup = {};
	let group = 0;
	for (const sourceNode of nodesWithInDegreesOfZero) {
		if (!(sourceNode in res)) {
			// Initialize source node's group.
			res[sourceNode] = group;

			// Set group for source node's intermediates.
			for (const intermediateNode of nodeToIntermediates[sourceNode] || []) {
				if (!(intermediateNode in res)) {
					res[intermediateNode] = group;
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
							res[possibleDistantRelativeNode] = group;
						}
					}
				}
			}
			group++;
		}
	}
	return res;
}

// Depth is an integer that describes how far down the graph
// a resource is.

// For example, given a graph of A->B, B->C, A has a depth
// of 0, B has a depth of 1, and C has a depth of 2.
function setDepthToNode(
	nodeToDependencies: GraphNodeToDependencies,
	nodesWithInDegreesOfZero: GraphNodesWithInDegreesOfZero,
): GraphDepthToNode {
	const res: GraphDepthToNode = {};
	let numOfNodesToProcess = Object.keys(nodeToDependencies).length;
	let depth = 0;

	// Process nodes with in-degrees of zero
	for (const nodeWithInDegreesOfZero of nodesWithInDegreesOfZero) {
		if (!res[depth]) {
			res[depth] = [];
		}
		res[depth].push(nodeWithInDegreesOfZero);
		numOfNodesToProcess--;
	}

	// Process remaining nodes
	while (numOfNodesToProcess > 0) {
		const nodesAtCurrentDepth = res[depth] || [];
		for (const nodeAtDepth of nodesAtCurrentDepth) {
			const depNodes = nodeToDependencies[nodeAtDepth] || [];
			for (const depNode of depNodes) {
				if (!res[depth + 1]) {
					res[depth + 1] = [];
				}
				res[depth + 1].push(depNode);
				numOfNodesToProcess--;
			}
		}
		depth++;
	}
	return res;
}

function setNodeToDepth(depthToNode: GraphDepthToNode): GraphNodeToDepth {
	const res: GraphNodeToDepth = {};
	for (const [depthStr, nodes] of Object.entries(depthToNode)) {
		const depth = Number(depthStr);
		for (const node of nodes) {
			res[node] = depth;
		}
	}
	return res;
}

function setGroupToDepthToNodes(
	nodeToGroup: GraphNodeToGroup,
	nodeToDepth: GraphNodeToDepth,
): GraphGroupToDepthToNodes {
	const res: GraphGroupToDepthToNodes = {};
	for (const [node, group] of Object.entries(nodeToGroup)) {
		if (!(group in res)) {
			res[group] = {};
		}

		const depth = nodeToDepth[node];

		if (!(depth in res[group])) {
			res[group][depth] = [];
		}

		res[group][depth].push(node);
	}
	return res;
}
