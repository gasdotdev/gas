export function setObjAsUpperSnakeCaseStr(obj: Record<string, string>): string {
	return Object.entries(obj)
		.map(([_, value]) => value)
		.join("_")
		.toUpperCase();
}

export function setUpperCaseSnakeAsCamelStr(str: string) {
	return str.toLowerCase().replace(/_(.)/g, (_, char) => char.toUpperCase());
}

export function setUpperSnakeCaseAsKebabStr(str: string) {
	return str.replace(/_/g, "-").toLowerCase();
}
