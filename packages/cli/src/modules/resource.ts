type Resource = {
	entityGroup: string;
	entity: string;
	cloud: string;
	cloudService: string;
	descriptor: string;
};

export function setResource(input: Resource): Resource {
	return {
		entityGroup: input.entityGroup.toLowerCase(),
		entity: input.entity.toLowerCase(),
		cloud: input.cloud.toLowerCase(),
		cloudService: input.cloudService.toLowerCase(),
		descriptor: input.descriptor.toLowerCase(),
	};
}

export function setResourceCamelCaseName(resource: Resource): string {
	return [
		resource.entityGroup,
		resource.entity,
		resource.cloud,
		resource.cloudService,
		resource.descriptor,
	]
		.map((part, index) =>
			index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
		)
		.join("");
}

export function setResourceKebabCaseName(resource: Resource): string {
	return `${resource.entityGroup}-${resource.entity}-${resource.cloud}-${resource.cloudService}-${resource.descriptor}`;
}

export function setResourceUpperSnakeCaseName(resource: Resource): string {
	return [
		resource.entityGroup,
		resource.entity,
		resource.cloud,
		resource.cloudService,
		resource.descriptor,
	]
		.map((part) => part.toUpperCase())
		.join("_");
}
