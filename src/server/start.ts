import { readFile } from 'node:fs/promises';
import { createMcpHttpServer } from './mcp.ts';
import { runtimeConfig } from './config.ts';
import { validateSnapshot } from './snapshots.ts';

const catalog = await validateSnapshot(JSON.parse(await readFile(process.env.MCP_CATALOG_FILE ?? new URL('../../generated/catalog.json', import.meta.url), 'utf8')));
const config = runtimeConfig(process.env);
if (config.mode === 'production' && catalog.site_url !== config.publicOrigin) throw new Error('内容快照与 PUBLIC_ORIGIN 不同');
const port = Number(process.env.MCP_PORT ?? 3333);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MCP_PORT 必须是 1 至 65535 的整数');
const host = process.env.MCP_BIND_HOST ?? '127.0.0.1';
if (!['127.0.0.1', '0.0.0.0', '::1'].includes(host)) throw new Error('MCP_BIND_HOST 必须是 127.0.0.1、0.0.0.0 或 ::1');
const app = createMcpHttpServer(catalog, { config, log: event => console.log(JSON.stringify(event)) });
await new Promise<void>((resolve, reject) => {
  app.httpServer.once('error', reject);
  app.httpServer.listen(port, host, resolve);
});
console.log(JSON.stringify({ event: 'ready', mode: config.mode, port, path: config.mcpPath, catalog_revision: catalog.catalog_revision }));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
