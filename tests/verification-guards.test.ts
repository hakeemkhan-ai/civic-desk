import { describe, expect, it } from 'vitest';
import { hostedRequestAllowed } from './browser/hosted-policy.js';
import { verificationDatabase } from './browser/data.js';

describe('verification data boundaries', () => {
  it('rejects persistent, remote, credential-bearing and ambiguous database targets', () => {
    for (const uri of [
      'mongodb://127.0.0.1:27017/civic_desk',
      'mongodb+srv://atlas.example/civic_verify_123456abcdef',
      'mongodb://remote.example/civic_verify_123456abcdef',
      'mongodb://user:password@127.0.0.1/civic_verify_123456abcdef',
      'mongodb://127.0.0.1/civic_verify_123456abcdef?authSource=admin',
      'mongodb://127.0.0.1/civic_verify_123456abcdef/other',
    ])
      expect(() => verificationDatabase(uri)).toThrow();
    expect(() =>
      verificationDatabase('mongodb://127.0.0.1:12345/civic_verify_123456abcdef'),
    ).not.toThrow();
  });
  it('permits hosted login/logout but blocks account creation, reports, uploads, decisions and foreign writes', () => {
    const origin = 'https://civic.example';
    for (const path of ['/api/auth/login', '/api/auth/logout']) {
      expect(hostedRequestAllowed('POST', origin + path, origin)).toBe(true);
    }
    for (const path of [
      '/api/auth/register',
      '/api/complaints',
      '/api/uploads',
      '/api/complaints/123/status',
      '/api/complaints/123/review',
      '/api/complaints/123/follow',
    ]) {
      for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
        expect(hostedRequestAllowed(method, origin + path, origin)).toBe(false);
      }
    }
    expect(hostedRequestAllowed('POST', 'https://foreign.example/api/auth/login', origin)).toBe(
      false,
    );
    expect(hostedRequestAllowed('POST', `${origin}/api/auth/login/extra`, origin)).toBe(false);
  });
});
