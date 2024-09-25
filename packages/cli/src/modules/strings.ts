export function convertObjectToCapitalSnakeCase(
	obj: Record<string, string>,
): string {
	return Object.entries(obj)
		.map(([_, value]) => value)
		.join("_")
		.toUpperCase();
}

export function convertKebabCaseToCapitalSnakeCase(str: string) {
	return str.replace(/-/g, "_").toUpperCase();
}

export function convertCapitalSnakeCaseToCamelCase(str: string) {
	return str.toLowerCase().replace(/_(.)/g, (_, char) => char.toUpperCase());
}

export function convertCapitalSnakeCaseToDotCase(str: string) {
	return str.toLowerCase().replace(/_/g, ".");
}

export function convertCapitalSnakeCaseToKebabCase(str: string) {
	return str.replace(/_/g, "-").toLowerCase();
}
