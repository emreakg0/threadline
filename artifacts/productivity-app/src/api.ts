export class ApiError extends Error {
 constructor(message: string, public status: number) { super(message); }
}
export async function api(path: string, method = 'GET', body?: unknown) {
 const url = '/api' + path;
 let response: Response;
 try { response = await fetch(url, {method, credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)}); }
 catch { throw new Error(`${method} ${url}: Cannot reach the API. Check that the API Server workflow is running on port 8080, then retry.`); }
 if (response.status === 401 && typeof window !== 'undefined')
   window.dispatchEvent(new Event('threadline:session-expired'));
 if (response.status === 204) return null;
 const text = await response.text();
 let data: any;
 try { data = text.trim() ? JSON.parse(text) : null; } catch { throw new Error(`${method} ${url} returned HTTP ${response.status} with a non-JSON response. Check API routing and server logs.`); }
 if (!response.ok) throw new ApiError(`${method} ${url}: ${data?.error || `HTTP ${response.status}. Check the API Server workflow and retry.`}`, response.status);
 if (data === null) throw new Error(`${method} ${url} returned an empty response. Check API routing and server logs.`);
 return data;
}
