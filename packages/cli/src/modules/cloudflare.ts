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

export async function cloudflareWorkersUploadVersion(): Promise<UploadVersionResponse> {
	const mockUploadVersionResponse: UploadVersionResponse = {
		id: "abc123def456",
		metadata: {
			author_email: "developer@example.com",
			author_id: "user_123456",
			created_on: "2023-04-15T10:30:00Z",
			modified_on: "2023-04-15T10:30:00Z",
			source: "api",
		},
		number: 1,
		resources: {
			bindings: [
				{
					json: '{"key": "value"}',
					name: "MY_BINDING",
					type: "json",
				},
			],
			script: {
				etag: "etag_987654321",
				handlers: ["fetch"],
				last_deployed_from: "cli",
			},
			script_runtime: {
				usage_model: "bundled",
			},
		},
		startup_time_ms: 50,
	};

	return mockUploadVersionResponse;

	/*
	const form = new FormData();

	const workerScript =
		"export default {async fetch(request, env) { return new Response('Hello, World!'); }}";

	form.append(
		"index.js",
		new File([workerScript], "index.js", {
			type: "application/javascript+module",
		}),
	);

	const metadata = {
		main_module: "index.js",
		bindings: [],
	};

	form.append("metadata", JSON.stringify(metadata));

	const scriptName = "example";

	const response = await fetchWrapper<BaseResponse<UploadVersionResponse>>(
		`${baseUrl}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${scriptName}/versions`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
			},
			body: form,
		},
	);

	return response;
	*/
}
