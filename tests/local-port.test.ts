import { createServer, type Server } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { assertLocalPortAvailable } from '../scripts/local-port.js';

const servers: Server[] = [];
async function listen(port = 0) {
  const server = createServer();
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).filter(s => s.listening).map(s =>
    new Promise<void>((resolve, reject) => s.close(e => e ? reject(e) : resolve())),
  ));
});

it('rejects an occupied port with recovery instructions and leaves the service running', async () => {
  const server = await listen();
  const port = (server.address() as { port: number }).port;
  await expect(assertLocalPortAvailable(port)).rejects.toThrow('already in use');
  await expect(assertLocalPortAvailable(port)).rejects.toThrow('skip npm run dev:db');
  expect(server.listening).toBe(true);
});

it('releases the probe port so the database can bind it afterwards', async () => {
  const server = await listen();
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  await assertLocalPortAvailable(port);
  const databaseStandIn = await listen(port);
  expect(databaseStandIn.listening).toBe(true);
});
