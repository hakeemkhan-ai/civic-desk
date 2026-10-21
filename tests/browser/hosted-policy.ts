export function hostedRequestAllowed(method: string, url: string, origin: string) {
  if (method === 'GET' || method === 'HEAD') return true;
  const target = new URL(url);
  return (
    target.origin === origin &&
    method === 'POST' &&
    ['/api/auth/login', '/api/auth/logout'].includes(target.pathname)
  );
}
