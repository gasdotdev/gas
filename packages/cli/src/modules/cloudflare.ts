import fetchWrapper from "./fetch.js";

const baseUrl = "https://api.cloudflare.com/client/v4";

type BaseResponse<TResult> = {
	success: true;
	result: TResult;
	errors: [];
	messages: [];
	result_info?: {
		page: number;
		per_page: number;
		total_pages: number;
		count: number;
		total_count: number;
	};
};

type UploadVersionResponse = {
	id: string;
	metadata: {
		author_email: string;
		author_id: string;
		created_on: string;
		modified_on: string;
		source: string;
	};
	number: number;
	resources: {
		bindings: Array<{
			json: string;
			name: string;
			type: string;
		}>;
		script: {
			etag: string;
			handlers: string[];
			last_deployed_from: string;
		};
		script_runtime: {
			usage_model: string;
		};
	};
	startup_time_ms: number;
};

export async function cloudflareWorkersUploadVersion(): Promise<
	BaseResponse<UploadVersionResponse>
> {
	const scriptName = "gastest";

	const url = `${baseUrl}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${scriptName}/versions`;

	const minimalScript = `
    export default {
      async fetch(request, env, ctx) {
        return new Response('Hello World!');
      }
    };
  `;

	const form = new FormData();

	const scriptBlob = new Blob([minimalScript], {
		type: "application/javascript",
	});
	form.append("index.js", scriptBlob, "index.js");

	const metadata = {
		main_module: "index.js",
		usage_model: "standard",
	};
	form.append("metadata", JSON.stringify(metadata));

	const response = await fetchWrapper<BaseResponse<UploadVersionResponse>>(
		url,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
			},
			body: form,
		},
	);

	return response;
}

/*	
export async function cloudflareWorkersUploadVersion(): Promise<
	BaseResponse<UploadVersionResponse>
> {
	try {
		const scriptName = "gastest";
		const url = `${baseUrl}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${scriptName}/versions`;

		const workerScript = await fs.promises.readFile(
			"./gas/core-base-cf-worker-api/build/src/index.core.base.cf.worker.api.js",
			"utf8",
		);

		// Generate a unique boundary
		const boundary = "----formdata" + Math.random().toString(36).slice(2);

		// Manually construct the multipart form data
		const formData = [];

		// Add the worker script part
		formData.push(
			`--${boundary}\r\n` +
				'Content-Disposition: form-data; name="index.js"; filename="index.js"\r\n' +
				"Content-Type: application/javascript\r\n\r\n" +
				workerScript +
				"\r\n",
		);

		// Add the metadata part
		const metadata = {
			main_module: "index.js",
			usage_model: "standard",
		};

		formData.push(
			`--${boundary}\r\n` +
				'Content-Disposition: form-data; name="metadata"\r\n' +
				"Content-Type: application/json\r\n\r\n" +
				JSON.stringify(metadata) +
				"\r\n",
		);

		// Add the final boundary
		formData.push(`--${boundary}--\r\n`);

		// Join all parts together
		const body = formData.join("");

		const response = await fetchWrapper<BaseResponse<UploadVersionResponse>>(
			url,
			{
				method: "POST",
				headers: {
					"Content-Type": `multipart/form-data; boundary=${boundary}`,
					Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
				},
				body: body,
			},
		);

		return response;
	} catch (error) {
		console.error("Error details:", error);
		throw new Error("Failed to upload worker version");
	}
}
	*/

/*
export async function cloudflareWorkersUploadVersion(): Promise<
	BaseResponse<UploadVersionResponse>
> {
	try {
		const scriptName = "gastest";
		const url = `${baseUrl}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${scriptName}/versions`;

		const workerScript = await fs.promises.readFile(
			"./gas/core-base-cf-worker-api/build/src/index.core.base.cf.worker.api.js",
			"utf8",
		);

		// Create FormData object
		const form = new FormData();

		// Add the worker script as a Blob
		const scriptBlob = new Blob([workerScript], {
			type: "application/javascript",
		});
		form.append("index.js", scriptBlob, "index.js");

		// Add metadata as a JSON string
		const metadata = {
			main_module: "index.js",
			usage_model: "standard",
		};
		form.append("metadata", JSON.stringify(metadata));

		const boundary = "----formdata" + Math.random().toString(36).slice(2);

		const response = await fetchWrapper<BaseResponse<UploadVersionResponse>>(
			url,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
					"Content-Type": `multipart/form-data; boundary=${boundary}`,
				},
				body: form,
			},
		);

		return response;
	} catch (error) {
		console.error("Error details:", error);
		throw new Error("Failed to upload worker version");
	}
}
	*/

/*
export async function cloudflareWorkersUploadVersion(): Promise<
	BaseResponse<UploadVersionResponse>
> {
	try {
		const scriptName = "gastest";
		const url = `${baseUrl}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${scriptName}/versions`;

		const workerScript = await fs.promises.readFile(
			"./gas/core-base-cf-worker-api/build/src/index.core.base.cf.worker.api.js",
			"utf8",
		);

		// Create FormData object
		const form = new FormData();

		// Add the worker script as a Blob
		const scriptBlob = new Blob([workerScript], {
			type: "application/javascript",
		});
		form.append("index.js", scriptBlob, "index.js");

		// Add metadata as a JSON string
		const metadata = {
			main_module: "index.js",
			usage_model: "standard",
		};
		form.append("metadata", JSON.stringify(metadata));

		const response = await fetchWrapper<BaseResponse<UploadVersionResponse>>(
			url,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
				},
				body: form,
			},
		);

		return response;
	} catch (error) {
		console.error("Error details:", error);
		throw new Error("Failed to upload worker version");
	}
}
	*/

/*
export async function cloudflareWorkersUploadVersion(): Promise<
	BaseResponse<UploadVersionResponse>
> {
	try {
		const scriptName = "gastest";
		const url = `${baseUrl}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${scriptName}/versions`;

		const workerScript = await fs.promises.readFile(
			"./gas/core-base-cf-worker-api/build/src/index.core.base.cf.worker.api.js",
			"utf8",
		);

		// Generate a unique boundary
		const boundary = "----" + Math.random().toString(36).substring(2);

		// Manually construct the multipart form data
		const formData = [];

		// Add the worker script part
		formData.push(
			`--${boundary}\r\n` +
				'Content-Disposition: form-data; name="index.js"; filename="index.js"\r\n' +
				"Content-Type: application/javascript\r\n\r\n" +
				workerScript +
				"\r\n",
		);

		// Add the metadata part
		const metadata = {
			main_module: "index.js",
			usage_model: "standard",
		};

		formData.push(
			`--${boundary}\r\n` +
				'Content-Disposition: form-data; name="metadata"\r\n' +
				"Content-Type: application/json\r\n\r\n" +
				JSON.stringify(metadata) +
				"\r\n",
		);

		// Add the final boundary
		formData.push(`--${boundary}--\r\n`);

		// Join all parts together
		const body = formData.join("");

		const response = await fetchWrapper<BaseResponse<UploadVersionResponse>>(
			url,
			{
				method: "POST",
				headers: {
					"Content-Type": `multipart/form-data; boundary=${boundary}`,
					Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
				},
				body: body,
			},
		);

		return response;
	} catch (error) {
		console.error(error);
		throw new Error("Failed to upload worker version");
	}
}
	*/

/*
export async function cloudflareWorkersUploadVersion(): Promise<
	BaseResponse<UploadVersionResponse>
> {
	try {
		const scriptName = "gastest";

		const url = `${baseUrl}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${scriptName}/versions`;

		const workerScript = await fs.promises.readFile(
			"./gas/core-base-cf-worker-api/build/src/index.core.base.cf.worker.api.js",
			"utf8",
		);

		const form = new FormData();

		const scriptBlob = new Blob([workerScript], {
			type: "application/javascript",
		});

		form.append("index.js", scriptBlob, "index.js");

		const metadata = {
			main_module: "index.js",
			//compatibility_date: "2023-07-25",
			usage_model: "standard",
			//bindings: [
			//	{
			//		name: "MY_ENV_VAR",
			//		type: "plain_text",
			//		text: "my_data",
			//	},
			//],
		};

		form.append("metadata", JSON.stringify(metadata));

		const test = await fetchWrapper<BaseResponse<UploadVersionResponse>>(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
			},
			body: form,
		});

		return test;
	} catch (error) {
		console.error(error);
		throw new error("failed");
	}
}
*/
