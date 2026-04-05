import net from 'node:net';
import type { ProviderInfo } from './types.js';

export const DEFAULT_APP_PORT = 3456;
const DEFAULT_HOST = '127.0.0.1';

interface StartableWebServer {
  start(port?: number): Promise<{ providers: ProviderInfo[]; active: ProviderInfo }>;
}

export async function startWebServerWithFallback(
  server: StartableWebServer,
  preferredPort: number = DEFAULT_APP_PORT,
  host: string = DEFAULT_HOST,
): Promise<{ providers: ProviderInfo[]; active: ProviderInfo; port: number }> {
  let port = await findAvailablePort(preferredPort, host);

  try {
    const result = await server.start(port);
    return { ...result, port };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'EADDRINUSE') throw err;

    port = await findAvailablePort(preferredPort + 1, host);
    const result = await server.start(port);
    return { ...result, port };
  }
}

export async function findAvailablePort(
  preferredPort: number = DEFAULT_APP_PORT,
  host: string = DEFAULT_HOST,
  attempts: number = 30,
): Promise<number> {
  for (let offset = 0; offset < attempts; offset++) {
    const port = preferredPort + offset;
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  return await allocateEphemeralPort(host);
}

async function isPortAvailable(port: number, host: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const tester = net.createServer();

    tester.once('error', () => {
      resolve(false);
    });

    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, host);
  });
}

async function allocateEphemeralPort(host: string): Promise<number> {
  return await new Promise((resolve, reject) => {
    const tester = net.createServer();

    tester.once('error', reject);
    tester.once('listening', () => {
      const address = tester.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      tester.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });

    tester.listen(0, host);
  });
}
