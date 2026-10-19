import { createServer } from 'node:net';

// Check before launching mongod so a second dev:db never silently chooses another port.
export async function assertLocalPortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${port} is already in use. If this is your development MongoDB, ` +
          'leave it running and skip npm run dev:db. Otherwise stop the conflicting ' +
          'service before retrying. Do not delete .data/mongo.',
          { cause: error },
        ));
      } else {
        reject(new Error(
          `Cannot bind 127.0.0.1:${port} (${error.code ?? error.message}). ` +
          'Run the database helper in an environment that permits local sockets.',
          { cause: error },
        ));
      }
    });
    probe.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      probe.close((error) => error ? reject(error) : resolve());
    });
  });
}
