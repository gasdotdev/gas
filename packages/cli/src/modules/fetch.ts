type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

interface FetchOptions extends RequestInit {
	method: HttpMethod;
	headers?: Record<string, string>;
	body?: any;
}

export async function fetchWrapper<T>(
	url: string,
	options: FetchOptions = { method: "GET" },
): Promise<T> {
	const { method, headers = {}, body, ...restOptions } = options;

	const defaultHeaders = {
		"Content-Type": "application/json",
		...headers,
	};

	const res = await fetch(url, {
		method,
		headers: defaultHeaders,
		body: body ? JSON.stringify(body) : undefined,
		...restOptions,
	});

	const data = await res.json();

	console.log(JSON.stringify(data));

	if (!res.ok) {
		throw new Error(`HTTP error: status: ${res.status}`);
	}

	return data as T;
}

export default fetchWrapper;
