export class Graph {
	private nameToDeps: Record<string, string[]> = {};
	private nodeToInDegrees: Record<string, number> = {};
	private nodesWithInDegreesOfZero: string[] = [];
	private nodeToIntermediates: Record<string, string[]> = {};
	private nodeToGroup: Record<string, number> = {};
	private depthToNode: Record<number, string[]> = {};
	private nodeToDepth: Record<string, number> = {};
	private groupToDepthToNodes: Record<number, Record<number, string[]>> = {};

	public static new(nameToDeps: Record<string, string[]>): Graph {
		const graph = new Graph();
		graph.nameToDeps = nameToDeps;
		graph.setNodeToInDegrees();
		graph.setNodesWithInDegreesOfZero();
		graph.setNodeToIntermediates();
		graph.setNodeToGroup();
		graph.setDepthToNode();
		graph.setNodeToDepth();
		graph.setGroupToDepthToNodes();
		return graph;
	}

	// In degrees is how many incoming edges a target node has.
	private setNodeToInDegrees(): void {
		// Loop over nodes and their dependencies.
		for (const deps of Object.values(this.nameToDeps)) {
			// Increment node's in degrees every time it's
			// found to be a dependency of another resource.
			for (const dep of deps) {
				this.nodeToInDegrees[dep] = (this.nodeToInDegrees[dep] || 0) + 1;
			}
		}

		// Ensure all nodes have an entry in nodeToInDegrees
		for (const node of Object.keys(this.nameToDeps)) {
			// Node has to have an in degree of 0 if it
			// hasn't been placed yet.
			if (!(node in this.nodeToInDegrees)) {
				this.nodeToInDegrees[node] = 0;
			}
		}
	}

	// Nodes with in degrees of 0 are nodes with no incoming edges.
	private setNodesWithInDegreesOfZero(): void {
		this.nodesWithInDegreesOfZero = [];
		for (const [node, inDegree] of Object.entries(this.nodeToInDegrees)) {
			if (inDegree === 0) {
				this.nodesWithInDegreesOfZero.push(node);
			}
		}
	}

	private walkDeps(node: string, memo: Record<string, string[]>): string[] {
		if (node in memo) {
			return memo[node];
		}

		const res: string[] = [];
		const deps = this.nameToDeps[node] || [];

		for (const dep of deps) {
			if (!res.includes(dep)) {
				res.push(dep);
				for (const transitiveDep of this.walkDeps(dep, memo)) {
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
	private setNodeToIntermediates(): void {
		const memo: Record<string, string[]> = {};
		for (const node of Object.keys(this.nameToDeps)) {
			this.nodeToIntermediates[node] = this.walkDeps(node, memo);
		}
	}

	// A group is an integer assigned to nodes that share
	// at least one common relative.
	private setNodeToGroup(): void {
		let group = 0;
		for (const sourceNode of this.nodesWithInDegreesOfZero) {
			if (!(sourceNode in this.nodeToGroup)) {
				// Initialize source node's group.
				this.nodeToGroup[sourceNode] = group;

				// Set group for source node's intermediates.
				for (const intermediateNode of this.nodeToIntermediates[sourceNode] ||
					[]) {
					if (!(intermediateNode in this.nodeToGroup)) {
						this.nodeToGroup[intermediateNode] = group;
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
				for (const possibleDistantRelativeNode of this
					.nodesWithInDegreesOfZero) {
					// Skip source node from the main for loop.
					if (possibleDistantRelativeNode !== sourceNode) {
						// Loop over possible distant relative's intermediates.
						for (const possibleDistantRelativeIntermediateNode of this
							.nodeToIntermediates[possibleDistantRelativeNode] || []) {
							// Check if possible distant relative's intermediate
							// is also an intermediate of source node.
							if (
								this.nodeToIntermediates[sourceNode]?.includes(
									possibleDistantRelativeIntermediateNode,
								)
							) {
								// If so, possible distant relative and source node
								// are distant relatives and belong to the same group.
								this.nodeToGroup[possibleDistantRelativeNode] = group;
							}
						}
					}
				}
				group++;
			}
		}
	}

	// Depth is an integer that describes how far down the graph
	// a resource is.

	// For example, given a graph of A->B, B->C, A has a depth
	// of 0, B has a depth of 1, and C has a depth of 2.
	private setDepthToNode(): void {
		let numOfNodesToProcess = Object.keys(this.nameToDeps).length;
		let depth = 0;

		// Process nodes with in-degrees of zero
		for (const nodeWithInDegreesOfZero of this.nodesWithInDegreesOfZero) {
			if (!this.depthToNode[depth]) {
				this.depthToNode[depth] = [];
			}
			this.depthToNode[depth].push(nodeWithInDegreesOfZero);
			numOfNodesToProcess--;
		}

		// Process remaining nodes
		while (numOfNodesToProcess > 0) {
			const nodesAtCurrentDepth = this.depthToNode[depth] || [];
			for (const nodeAtDepth of nodesAtCurrentDepth) {
				const depNodes = this.nameToDeps[nodeAtDepth] || [];
				for (const depNode of depNodes) {
					if (!this.depthToNode[depth + 1]) {
						this.depthToNode[depth + 1] = [];
					}
					this.depthToNode[depth + 1].push(depNode);
					numOfNodesToProcess--;
				}
			}
			depth++;
		}
	}

	private setNodeToDepth(): void {
		for (const [depthStr, nodes] of Object.entries(this.depthToNode)) {
			const depth = Number(depthStr);
			for (const node of nodes) {
				this.nodeToDepth[node] = depth;
			}
		}
	}

	private setGroupToDepthToNodes(): void {
		for (const [node, group] of Object.entries(this.nodeToGroup)) {
			if (!(group in this.groupToDepthToNodes)) {
				this.groupToDepthToNodes[group] = {};
			}

			const depth = this.nodeToDepth[node];

			if (!(depth in this.groupToDepthToNodes[group])) {
				this.groupToDepthToNodes[group][depth] = [];
			}

			this.groupToDepthToNodes[group][depth].push(node);
		}
	}
}
