import { isIP } from 'node:net';
import type { User } from './db.js';
import { config } from './config.js';
import { MAX_PHOTO_BYTES } from './uploads.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers?: HeadersInit,
  ) {
    super(message);
  }
}

export type ApiContext = {
  request: Request;
  user?: User;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;
};

export type Route = {
  method: string;
  path: string;
  staff: boolean;
  handle(context: ApiContext): Response | Promise<Response>;
};

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

export function responseHeaders(original?: HeadersInit): Headers {
  const headers = new Headers(original);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Origin-Agent-Cluster', '?1');
  headers.set('X-DNS-Prefetch-Control', 'off');
  headers.set('X-Download-Options', 'noopen');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('X-XSS-Protection', '0');
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "font-src 'self' https: data:",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "img-src 'self' blob: data: https://tile.openstreetmap.org",
    "object-src 'none'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self' https: 'unsafe-inline'",
  ];
  if (config.NODE_ENV === 'production') policy.push('upgrade-insecure-requests');
  headers.set('Content-Security-Policy', policy.join('; '));
  if (config.NODE_ENV === 'production')
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return headers;
}

async function readBounded(request: Request, limit: number): Promise<Buffer> {
  if (Number(request.headers.get('content-length')) > limit)
    throw new HttpError(413, 'The request is too large.');
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, 'The request is too large.');
      }
      parts.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts, size);
}

export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return undefined;
  const bytes = await readBounded(request, 32 * 1024);
  if (!bytes.length) return {};
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  // Preserve strict JSON request parsing: top-level scalars are not accepted.
  if (value === null || typeof value !== 'object') throw new SyntaxError('Invalid JSON body');
  return value;
}

export async function readPhoto(request: Request): Promise<Buffer> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;'))
    throw new HttpError(400, 'Choose a photo.');
  let bytes: Buffer;
  try {
    bytes = await readBounded(request, MAX_PHOTO_BYTES + 64 * 1024);
  } catch (error) {
    if (error instanceof HttpError && error.status === 413)
      throw new HttpError(400, 'Choose one photo under 5 MB.');
    throw error;
  }
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': request.headers.get('content-type')! },
    }).formData();
  } catch {
    throw new HttpError(400, 'Choose one photo under 5 MB.');
  }
  const entries = [...form.entries()];
  if (!entries.length) throw new HttpError(400, 'Choose a photo.');
  const photo = form.get('photo');
  if (entries.length !== 1 || !(photo instanceof File) || photo.size > MAX_PHOTO_BYTES)
    throw new HttpError(400, 'Choose one photo under 5 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type))
    throw new HttpError(400, 'Choose a JPEG, PNG, or WebP photo.');
  return Buffer.from(await photo.arrayBuffer());
}

export function clientKey(request: Request): string {
  // Native route handlers expose no socket address. Only explicitly trusted proxy
  // hops may supply client identity; otherwise anonymous traffic shares a bucket.
  if (!config.TRUST_PROXY_HOPS) return 'anonymous';
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map((part) => part.trim());
  const address = forwarded?.at(-config.TRUST_PROXY_HOPS);
  if (!address || address.length > 64) return 'anonymous';
  if (isIP(address) === 4) return `ipv4:${address}`;
  if (isIP(address) !== 6) return 'anonymous';
  let canonical: string;
  try {
    canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  } catch {
    return 'anonymous';
  }
  const [head, tail] = canonical.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = canonical.includes('::')
    ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
    : left;
  const words = groups.map((group) => Number.parseInt(group, 16));
  // Proxies may spell IPv4 peers using IPv4-mapped IPv6 notation.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return `ipv4:${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`;
  }
  // Match the former limiter's /56 IPv6 grouping so rotating interface addresses
  // within an allocated subnet cannot reset sign-in limits.
  const subnet = words.slice(0, 4).map((word, i) => (i === 3 ? word & 0xff00 : word));
  return `ipv6:${subnet.map((word) => word.toString(16)).join(':')}/56`;
}
