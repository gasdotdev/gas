export function stringsConvertObjectToCapitalSnakeCase(
	obj: Record<string, string>,
): string {
	return Object.entries(obj)
		.map(([_, value]) => value)
		.join("_")
		.toUpperCase();
}

export function stringsConvertCapitalSnakeCaseToCamelCase(str: string) {
	return str.toLowerCase().replace(/_(.)/g, (_, char) => char.toUpperCase());
}

export function stringsConvertCapitalSnakeCaseToDotCase(str: string) {
	return str.toLowerCase().replace(/_/g, ".");
}

export function stringsConvertCapitalSnakeCaseToKebabCase(str: string) {
	return str.replace(/_/g, "-").toLowerCase();
}
