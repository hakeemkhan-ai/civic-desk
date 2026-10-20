export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    cache: 'no-store',
    signal: options.signal ?? AbortSignal.timeout(45000),
    credentials: 'same-origin',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      'X-Civic-Request': '1',
      ...options.headers,
    },
  }).catch(() => {
    throw new ApiError(
      'We could not reach Civic Desk in time. Check your connection and try again.',
      0,
    );
  });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: 'The service could not be reached.' }));
    throw new ApiError(
      data.fields?.length
        ? `${data.error} ${data.fields.map((f: { path: string; message: string }) => `${f.path}: ${f.message}`).join(' ')}`
        : (data.error ?? 'Please try again.'),
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const body = (value: unknown) => JSON.stringify(value);
