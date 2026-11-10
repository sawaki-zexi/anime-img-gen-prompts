import { createServer } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { Catalog } from '../lib/schema.ts';
import { createPromptRuntime } from './runtime.ts';
export { createPromptMcpServer } from './tools.ts';

/** Node adapter for the same Fetch runtime deployed to Workers. Never trust forwarded IP headers. */
export function createMcpHttpServer(catalog: Catalog | (() => Catalog), options: Parameters<typeof createPromptRuntime>[1] = {}) {
  const runtime = createPromptRuntime(catalog, options);
  const httpServer = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const adapter = toNodeHandler({ fetch: webRequest => runtime.fetch(webRequest, { clientKey: request.socket.remoteAddress ?? 'anonymous' }) }, { maxRequestBodySize: runtime.config.maxBodyBytes, onerror: () => {} });
    void adapter(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' });
      response.end(JSON.stringify({ error: 'UNAVAILABLE', retryable: true }));
    });
  });
  httpServer.requestTimeout = 30_000;
  httpServer.headersTimeout = 20_000;
  return {
    httpServer,
    async close() {
      await runtime.close();
      if (httpServer.listening) {
        httpServer.closeAllConnections();
        await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
      }
    },
  };
}
