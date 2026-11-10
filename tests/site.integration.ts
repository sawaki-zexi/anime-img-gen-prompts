import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHttpServer } from '../src/server/mcp.ts';
import { createSearchCatalog, searchPrompts } from '../src/lib/catalog.ts';
import { catalogSchema, detailDocumentSchema, getResultSchema, renderResultSchema, searchCatalogSchema, searchResultSchema } from '../src/lib/schema.ts';
import { catalog, projectRoot } from './helpers.ts';

function embeddedJson(html: string, id: string): unknown {
  const match = html.match(new RegExp(`<script\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`));
  assert.ok(match, `Missing browser data: ${id}`);
  return JSON.parse(match[1]!);
}

test('all built details, lazy-copy documents and HTTP MCP share exact templates, examples and revisions', async t => {
  const publicIndex = searchCatalogSchema.parse(JSON.parse(await readFile(path.join(projectRoot, 'dist/catalog.json'), 'utf8')));
  const home = await readFile(path.join(projectRoot, 'dist/index.html'), 'utf8');
  const browserHome = searchCatalogSchema.parse(embeddedJson(home, 'catalog-data'));
  assert.deepEqual(publicIndex, createSearchCatalog(catalog)); assert.deepEqual(browserHome, publicIndex);
  for (const prompt of catalog.prompts) {
    assert.ok(!home.includes(prompt.template));
    assert.ok(!JSON.stringify(publicIndex).includes(prompt.template));
    assert.ok(!Object.hasOwn(publicIndex.prompts.find(item => item.id === prompt.id)!, 'variables'));
  }
  const app = createMcpHttpServer(catalog); t.after(() => app.close());
  app.httpServer.listen(0, '127.0.0.1'); await once(app.httpServer, 'listening');
  const address = app.httpServer.address(); assert.ok(address && typeof address !== 'string');
  const client = new Client({ name: 'built-gallery-parity-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
  await client.listTools();
  for (const prompt of catalog.prompts) {
    const html = await readFile(path.join(projectRoot, 'dist/prompts', prompt.id, 'index.html'), 'utf8');
    const browser = embeddedJson(html, 'detail-data') as { catalog: unknown; id: string };
    const detailCatalog = catalogSchema.parse(browser.catalog);
    assert.deepEqual(detailCatalog.prompts, [prompt]); assert.equal(detailCatalog.catalog_revision, publicIndex.catalog_revision);
    assert.ok(html.includes(`data-prompt-revision="${prompt.prompt_revision}"`));
    const copy = detailDocumentSchema.parse(JSON.parse(await readFile(path.join(projectRoot, 'dist/data/prompts', `${prompt.id}.json`), 'utf8')));
    assert.deepEqual(copy.prompt, prompt); assert.equal(copy.catalog_revision, catalog.catalog_revision);
    const fetched = getResultSchema.parse((await client.callTool({ name: 'get_prompt', arguments: { id: prompt.id, include_examples: true } })).structuredContent);
    assert.ok(fetched.ok); assert.deepEqual(fetched.data, prompt);
    const rendered = renderResultSchema.parse((await client.callTool({ name: 'render_prompt', arguments: { id: prompt.id, expected_revision: prompt.prompt_revision, variables: {} } })).structuredContent);
    assert.ok(rendered.ok); assert.equal(rendered.data.prompt, prompt.examples[0]!.effective_prompt);
  }
  for (const input of [{}, { query: 'watercolor wallpaper' }, { query: '梗图' }, { use_cases: ['avatar', 'scenery'], styles: ['watercolor'] }, { model: 'unknown-model', verified_only: true }]) {
    const wire = searchResultSchema.parse((await client.callTool({ name: 'search_prompts', arguments: input })).structuredContent);
    const browser = searchPrompts(publicIndex, input);
    assert.deepEqual(wire, browser);
    if (wire.ok && wire.data.next_cursor) {
      const next = { ...input, cursor: wire.data.next_cursor };
      assert.deepEqual(searchResultSchema.parse((await client.callTool({ name: 'search_prompts', arguments: next })).structuredContent), searchPrompts(publicIndex, next));
    }
  }
});
