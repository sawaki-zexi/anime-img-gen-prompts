import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHttpServer } from '../src/server/mcp.ts';
import { catalogSchema, getResultSchema, renderResultSchema } from '../src/lib/schema.ts';
import { catalog, projectRoot, prompt } from './helpers.ts';

function embeddedJson(html: string, id: string): unknown {
  const match = html.match(new RegExp(`<script\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`));
  assert.ok(match, `Missing browser data: ${id}`);
  return JSON.parse(match[1]!);
}

test('the built home, detail, public JSON and real HTTP MCP contain exactly the same record, template and revisions', async t => {
  const publicCatalog = catalogSchema.parse(JSON.parse(await readFile(path.join(projectRoot, 'dist/catalog.json'), 'utf8')));
  const home = await readFile(path.join(projectRoot, 'dist/index.html'), 'utf8');
  const detail = await readFile(path.join(projectRoot, 'dist/prompts', prompt.id, 'index.html'), 'utf8');
  const browserHome = catalogSchema.parse(embeddedJson(home, 'catalog-data'));
  const browserDetail = embeddedJson(detail, 'detail-data') as { catalog: unknown; id: string };
  const detailCatalog = catalogSchema.parse(browserDetail.catalog);
  assert.deepEqual(publicCatalog, catalog);
  assert.deepEqual(browserHome, catalog);
  assert.equal(detailCatalog.catalog_revision, catalog.catalog_revision);
  assert.deepEqual(detailCatalog.prompts, [prompt]);
  assert.equal(browserDetail.id, prompt.id);
  assert.ok(home.includes(`data-prompt-revision="${prompt.prompt_revision}"`));
  assert.ok(detail.includes(`data-prompt-revision="${prompt.prompt_revision}"`));
  assert.ok(detail.includes('id="copy-original"'));
  assert.ok(detail.includes('id="copy-rendered"'));

  const app = createMcpHttpServer(publicCatalog); t.after(() => app.close());
  app.httpServer.listen(0, '127.0.0.1'); await once(app.httpServer, 'listening');
  const address = app.httpServer.address(); assert.ok(address && typeof address !== 'string');
  const client = new Client({ name: 'built-gallery-parity-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
  await client.listTools();
  const fetched = getResultSchema.parse((await client.callTool({ name: 'get_prompt', arguments: { id: browserDetail.id, include_examples: true } })).structuredContent);
  assert.ok(fetched.ok); assert.deepEqual(fetched.data, detailCatalog.prompts[0]);
  const rendered = renderResultSchema.parse((await client.callTool({ name: 'render_prompt', arguments: { id: browserDetail.id, expected_revision: fetched.data.prompt_revision, variables: {} } })).structuredContent);
  assert.ok(rendered.ok);
  assert.equal(rendered.data.prompt, prompt.examples[0]!.effective_prompt);
  assert.equal(rendered.catalog_revision, browserHome.catalog_revision);
});
