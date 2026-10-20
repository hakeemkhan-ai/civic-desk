import { describe, expect, it } from 'vitest';
import { createApi } from '../server/app.js';
import { readJson, readPhoto, RateLimiter, clientKey } from '../server/http.js';
import { sessionToken } from '../server/auth.js';
import type { Db } from 'mongodb';
import { config } from '../server/config.js';

describe('native Web request boundaries', () => {
  it('rejects malformed/scalar JSON and bounds bytes without trusting Content-Length', async () => {
    const request = (body: string) => new Request('http://localhost/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    await expect(readJson(request('{broken'))).rejects.toBeInstanceOf(SyntaxError);
    await expect(readJson(request('null'))).rejects.toBeInstanceOf(SyntaxError);
    await expect(readJson(request(JSON.stringify({ text: '🌳'.repeat(10000) }))))
      .rejects.toMatchObject({ status: 413 });
  });

  it('decodes the session cookie and rejects malformed encoding', () => {
    const request = (cookie: string) => new Request('http://localhost/api/auth/me', {
      headers: { cookie },
    });
    expect(sessionToken(request('other=1; session=abc%20def; another=2'))).toBe('abc def');
    expect(sessionToken(request('session=%broken'))).toBeUndefined();
    expect(sessionToken(request('unrelated=value'))).toBeUndefined();
    expect(sessionToken(request('session; other=1'))).toBeUndefined();
  });

  it('rejects ambiguous multipart uploads instead of silently selecting one file', async () => {
    const form = new FormData();
    form.append('photo', new File(['image'], 'a.png', { type: 'image/png' }));
    form.append('photo', new File(['image'], 'b.png', { type: 'image/png' }));
    const request = new Request('http://localhost/api/uploads', { method: 'POST', body: form });
    await expect(readPhoto(request)).rejects.toMatchObject({ status: 400 });
  });

  it('provides Retry-After and maintains independent rate-limit buckets', () => {
    const limiter = new RateLimiter(60000, 1, 'Slow down');
    limiter.check('one');
    expect(() => limiter.check('one')).toThrowError(expect.objectContaining({
      status: 429, headers: { 'Retry-After': expect.any(String) },
    }));
    expect(() => limiter.check('two')).not.toThrow();
  });

  it('ignores untrusted forwarding and groups trusted IPv6 addresses in one subnet', () => {
    const original = config.TRUST_PROXY_HOPS;
    const request = (forwarded: string) => new Request('http://localhost/api/auth/login', {
      headers: { 'X-Forwarded-For': forwarded },
    });
    try {
      config.TRUST_PROXY_HOPS = 0;
      expect(clientKey(request('198.51.100.1'))).toBe('anonymous');
      expect(clientKey(request('198.51.100.2'))).toBe('anonymous');
      config.TRUST_PROXY_HOPS = 1;
      const first = clientKey(request('2001:db8:1234:ab01::1'));
      expect(clientKey(request('2001:db8:1234:abff::2'))).toBe(first);
      expect(clientKey(request('2001:db8:1234:ac00::1'))).not.toBe(first);
      expect(clientKey(request('2001:0db8:1234:ab01:0000:0000:0000:0001'))).toBe(first);
      expect(clientKey(request('forged, 198.51.100.8'))).toBe(clientKey(request('198.51.100.8')));
    } finally {
      config.TRUST_PROXY_HOPS = original;
    }
  });

  it('returns safe uncached JSON errors and bodyless HEAD errors', async () => {
    const db = { collection: () => ({}) } as unknown as Db;
    const { handle } = createApi(db, null);
    const response = await handle(new Request('http://localhost/api/complaints'));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const head = await handle(new Request('http://localhost/api/complaints', { method: 'HEAD' }));
    expect(head.status).toBe(401);
    expect(await head.text()).toBe('');
  });

  it('stops repeated invalid sessions before additional database authentication lookups', async () => {
    let lookups = 0;
    const db = {
      collection: () => ({ findOne: async () => { lookups += 1; return null; } }),
    } as unknown as Db;
    const { handle } = createApi(db, null);
    const request = () => new Request('http://localhost/api/complaints', {
      headers: { cookie: 'session=expired' },
    });
    for (let i = 0; i < 150; i++) expect((await handle(request())).status).toBe(401);
    const rejected = await handle(request());
    expect(rejected.status).toBe(429);
    expect(Number(rejected.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(lookups).toBe(150);
  });
});
