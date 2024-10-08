export function deepMergeObjects<T extends object>(target: T, source: T): T {
	for (const key in source) {
		if (source[key] instanceof Object && key in target) {
			Object.assign(
				source[key],
				deepMergeObjects((target as any)[key], source[key]),
			);
		}
	}

	return structuredClone(Object.assign(target || {}, source));
}
