import { readFile } from 'node:fs/promises';
import { catalogSchema } from '../lib/schema.ts';
import { createMcpHttpServer } from './mcp.ts';

const catalog = catalogSchema.parse(JSON.parse(await readFile(new URL('../../generated/catalog.json', import.meta.url), 'utf8')));
const port = Number(process.env.MCP_PORT ?? 3333);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MCP_PORT 必须是 1 至 65535 的整数');
const app = createMcpHttpServer(catalog);
await new Promise<void>((resolve, reject) => {
  app.httpServer.once('error', reject);
  app.httpServer.listen(port, '127.0.0.1', resolve);
});
console.log(`MCP: http://127.0.0.1:${port}/mcp · ${catalog.catalog_revision}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
