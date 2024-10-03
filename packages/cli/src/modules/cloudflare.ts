import fetchWrapper from "./fetch.js";

const baseUrl = "https://api.cloudflare.com/client/v4";

type BaseResponse<TResult> = {
	success: true;
	result: TResult;
	errors: [];
	messages: [];
	result_info: {
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

export async function cloudflareWorkersUploadVersion({
	accountId,
	apiToken,
	metadata,
	scriptName,
	workerScript,
}: {
	accountId: string;
	apiToken: string;
	metadata: object;
	scriptName: string;
	workerScript: string;
}): Promise<BaseResponse<UploadVersionResponse>> {
	const url = `${baseUrl}/accounts/${accountId}/workers/scripts/${scriptName}/versions`;

	/*
	const form = new FormData();
	form.append(
		"worker.js",
		new Blob([workerScript], { type: "application/javascript" }),
		"worker.js",
	);
	form.append(
		"metadata",
		JSON.stringify({
			...metadata,
			main_module: "worker.js",
		}),
	);
    */

	return fetchWrapper<BaseResponse<UploadVersionResponse>>(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiToken}`,
		},
		//	body: form,
	});
}
