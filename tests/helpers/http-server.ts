import { createServer, type IncomingMessage } from 'node:http';

/** Exercise the real Web handler over HTTP; Supertest only supplies requests/cookies. */
export function httpServer(handle: (request: Request) => Promise<Response>) {
  return createServer(async (incoming: IncomingMessage, outgoing) => {
    try {
      const headers = new Headers();
      for (let i = 0; i < incoming.rawHeaders.length; i += 2)
        headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const method = incoming.method ?? 'GET';
      const response = await handle(new Request(`http://${headers.get('host')}${incoming.url}`, {
        method,
        headers,
        ...(method !== 'GET' && method !== 'HEAD'
          ? { body: Buffer.concat(chunks) }
          : {}),
      }));
      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') outgoing.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoing.setHeader('set-cookie', cookies);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      outgoing.statusCode = 500;
      outgoing.end(error instanceof Error ? error.message : 'Test adapter failure');
    }
  });
}
