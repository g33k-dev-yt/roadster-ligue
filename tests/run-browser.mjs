// Run the smoke suite against an existing BASE_URL or start/close a production preview.
import { preview } from 'vite';
import fs from 'node:fs/promises';
await fs.mkdir('qa', { recursive: true });
let server;
try {
  if (!process.env.BASE_URL) {
    server = await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
    const address = server.httpServer.address();
    process.env.BASE_URL = `http://127.0.0.1:${address.port}/`;
  }
  await import('./smoke.mjs');
} finally {
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
