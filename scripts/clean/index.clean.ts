import { promises as fs } from "node:fs";
import path from "node:path";

await main();

async function main() {
	const dirsArg = process.argv[2];

	if (!dirsArg) {
		console.error(
			"Provide directories to clean as the first argument, separated by commas",
		);
		process.exit(1);
	}

	const dirs = dirsArg.split(",");

	try {
		await Promise.all(
			dirs.map(async (dir) => {
				const fullPath = path.resolve(process.cwd(), dir);
				try {
					await fs.rm(fullPath, { recursive: true, force: true });
					console.log(`Successfully deleted: ${fullPath}`);
				} catch (error) {
					if (error.code !== "ENOENT") {
						console.error(`Error deleting ${fullPath}:`, error.message);
					} else {
						console.log(`Directory not found (skipping): ${fullPath}`);
					}
				}
			}),
		);

		console.log("Clean operation completed.");
	} catch (error) {
		console.error("An unexpected error occurred:", error);
	}
}
