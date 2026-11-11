import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createPromptRuntime, type RequestLog } from '../src/server/runtime.ts';
import { runtimeConfig } from '../src/server/config.ts';
import { createSnapshotStore } from '../src/server/snapshots.ts';
import { contentDigest } from '../src/lib/revision.ts';
import { getResultSchema, searchResultSchema } from '../src/lib/schema.ts';
import { catalog } from './helpers.ts';

test('production runtime refuses invalid config, restricts Host/Origin and advertises its actual version without shared caches', async t => {
  for (const env of [{ MCP_MODE: 'wrong' }, { MCP_MODE: 'production' }, { MCP_MODE: 'production', PUBLIC_ORIGIN: 'http://localhost' }, { MCP_RATE_LIMIT: '0' }, { MCP_MAX_BODY_BYTES: 'NaN' }, { MCP_PATH: '/health' }]) assert.throws(() => runtimeConfig(env));
  const origin = 'https://anime-prompt-atelier.memorablestone1.chatgpt.site';
  const runtime = createPromptRuntime(catalog, { config: runtimeConfig({ MCP_MODE: 'production', PUBLIC_ORIGIN: origin }) }); t.after(() => runtime.close());
  for (const headers of [{ Host: 'other.invalid' }, { Origin: 'https://other.invalid' }, { Origin: `${origin}.invalid` }] as Record<string, string>[]) {
    const response = await runtime.fetch(new Request(`${origin}/health`, { headers })); assert.equal(response.status, 403); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const response = await runtime.fetch(new Request(`${origin}/health`, { headers: { Origin: origin } }));
  const health = await response.json() as any;
  assert.equal(health.status, 'ok'); assert.equal(health.catalog_revision, catalog.catalog_revision); assert.equal(health.mcp_path, '/api/mcp');
  assert.equal(response.headers.get('access-control-allow-origin'), origin); assert.ok(response.headers.get('x-request-id')); assert.match(response.headers.get('server-timing')!, /^app;dur=\d/);
  assert.equal((await runtime.fetch(new Request(`${origin}/mcp`))).status, 404);
});

test('limits return explicit retry windows, bound client state, reset predictably and enforce streamed bodies without Content-Length', async t => {
  let now = 0;
  const runtime = createPromptRuntime(catalog, { now: () => now, config: runtimeConfig({ MCP_RATE_LIMIT: '2', MCP_GLOBAL_RATE_LIMIT: '3', MCP_RATE_WINDOW_MS: '1000', MCP_MAX_CLIENTS: '2' }) }); t.after(() => runtime.close());
  const request = () => new Request('http://localhost/mcp', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  await runtime.fetch(request(), { clientKey: 'first' }); await runtime.fetch(request(), { clientKey: 'first' });
  let limited = await runtime.fetch(request(), { clientKey: 'first' });
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '1'); assert.equal((await limited.json() as any).error, 'RATE_LIMITED');
  await runtime.fetch(request(), { clientKey: 'second' });
  limited = await runtime.fetch(request(), { clientKey: 'second' }); assert.equal(limited.status, 429);
  limited = await runtime.fetch(request(), { clientKey: 'third' }); assert.equal(limited.status, 429);
  now = 1001;
  assert.equal((await runtime.fetch(request(), { clientKey: 'third' })).status, 415);
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(128 * 1024)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
  const oversized = await runtime.fetch(new Request('http://localhost/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit));
  assert.equal(oversized.status, 413); assert.equal(oversized.headers.get('cache-control'), 'no-store');
});

test('Retry-After uses only exhausted buckets and waits for the latest exhausted reset when client/global windows differ', async t => {
  let now = 0;
  const clientLimited = createPromptRuntime(catalog, { now: () => now, config: runtimeConfig({ MCP_RATE_LIMIT: '2', MCP_GLOBAL_RATE_LIMIT: '99' }) }); t.after(() => clientLimited.close());
  const request = () => new Request('http://localhost/mcp', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  await clientLimited.fetch(request(), { clientKey: 'a' });
  now = 30000; await clientLimited.fetch(request(), { clientKey: 'b' }); await clientLimited.fetch(request(), { clientKey: 'b' });
  now = 40000; assert.equal((await clientLimited.fetch(request(), { clientKey: 'b' })).headers.get('retry-after'), '50');
  now = 60000; assert.equal((await clientLimited.fetch(request(), { clientKey: 'b' })).headers.get('retry-after'), '30');

  now = 0;
  const globalLimited = createPromptRuntime(catalog, { now: () => now, config: runtimeConfig({ MCP_RATE_LIMIT: '5', MCP_GLOBAL_RATE_LIMIT: '3' }) }); t.after(() => globalLimited.close());
  await globalLimited.fetch(request(), { clientKey: 'a' });
  now = 30000; await globalLimited.fetch(request(), { clientKey: 'b' });
  now = 60000; await globalLimited.fetch(request(), { clientKey: 'a' });
  now = 70000; await globalLimited.fetch(request(), { clientKey: 'b' });
  now = 75000; await globalLimited.fetch(request(), { clientKey: 'c' });
  now = 80000; assert.equal((await globalLimited.fetch(request(), { clientKey: 'b' })).headers.get('retry-after'), '40');
});

test('request logs contain only controlled metadata and service failures return actionable errors without private values or stacks', async t => {
  const logs: RequestLog[] = [];
  let unavailable = false;
  const runtime = createPromptRuntime(() => { if (unavailable) throw new Error('secret filesystem stack private-value'); return catalog; }, { log: event => logs.push(event) }); t.after(() => runtime.close());
  for (const mode of ['legacy', { pin: '2026-07-28' }] as const) {
    const client = new Client({ name: 'privacy-test', version: '1' }, { versionNegotiation: { mode } }); t.after(() => client.close());
    await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), { fetch: (input, init) => runtime.fetch(new Request(input, init)) }));
    await client.callTool({ name: 'search_prompts', arguments: { query: 'private query 83f91' } });
    await client.callTool({ name: 'render_prompt', arguments: { id: catalog.prompts[0]!.id, expected_revision: catalog.prompts[0]!.prompt_revision, variables: { hidden: 'private variable b2531' } } });
  }
  const toolLog = logs.find(event => event.tool === 'search_prompts'); assert.ok(toolLog); assert.equal(toolLog.result_count, 0);
  assert.equal(logs.find(event => event.tool === 'render_prompt')!.error_code, 'INVALID_VARIABLES');
  assert.equal(logs.filter(event => event.tool === 'search_prompts').length, 2); assert.equal(logs.filter(event => event.tool === 'render_prompt').length, 2);
  for (const log of logs) assert.deepEqual(Object.keys(log).sort(), ['catalog_revision', 'elapsed_ms', 'error_code', 'http_status', 'request_id', 'result_count', 'service_version', 'tool']);
  assert.ok(!JSON.stringify(logs).includes('private query')); assert.ok(!JSON.stringify(logs).includes('private variable')); assert.ok(!JSON.stringify(logs).includes('127.0.0.1'));
  unavailable = true;
  const failure = await runtime.fetch(new Request('http://localhost/health'));
  assert.equal(failure.status, 503); assert.equal(failure.headers.get('retry-after'), '5');
  const body = await failure.text(); assert.ok(body.includes('UNAVAILABLE')); assert.ok(!body.includes('secret')); assert.ok(!body.includes('stack'));
});

test('one already connected standard client observes a checked new snapshot, rejects a bad switch and can return to the previous version', async t => {
  const store = await createSnapshotStore(catalog);
  const runtime = createPromptRuntime(store.current); t.after(() => runtime.close());
  const client = new Client({ name: 'installed-update-fixture', version: '1' }, { versionNegotiation: { mode: 'legacy' } }); t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), { fetch: (input, init) => runtime.fetch(new Request(input, init)) }));
  const unwrap = (value: any) => value.result ?? value;
  async function search() { return searchResultSchema.parse(unwrap((await client.callTool({ name: 'search_prompts', arguments: { query: 'isolated-update-fixture' } })).structuredContent)); }
  const before = await search(); assert.ok(before.ok); assert.equal(before.data.items.length, 0);
  const clone = structuredClone(catalog.prompts[0]!);
  clone.id = 'isolated-update-fixture'; clone.title = 'ISOLATED UPDATE FIXTURE'; clone.keywords.push('isolated-update-fixture'); clone.url = new URL('/prompts/isolated-update-fixture/', catalog.site_url).href;
  clone.related_ids = [];
  clone.examples.forEach(example => { example.provenance = `ISOLATED TEST FIXTURE reuses ${catalog.prompts[0]!.id} pixels; no new image generated.`; });
  clone.prompt_revision = await contentDigest(clone);
  const { catalog_revision: _, ...payload } = { ...structuredClone(catalog), prompts: [...catalog.prompts, clone] };
  const next = { ...payload, catalog_revision: await contentDigest(payload) };
  await store.activate(next);
  const after = await search(); assert.ok(after.ok); assert.deepEqual(after.data.items.map(item => item.id), [clone.id]); assert.equal(after.catalog_revision, next.catalog_revision);
  const detail = getResultSchema.parse(unwrap((await client.callTool({ name: 'get_prompt', arguments: { id: clone.id } })).structuredContent)); assert.ok(detail.ok);
  await assert.rejects(store.activate({ ...next, prompts: [] }), /摘要/); assert.equal(store.current().catalog_revision, next.catalog_revision);
  await store.activate(catalog); const rollback = await search(); assert.ok(rollback.ok); assert.equal(rollback.data.items.length, 0); assert.equal(rollback.catalog_revision, catalog.catalog_revision);
  assert.equal((await runtime.fetch(new Request('http://localhost/health')).then(response => response.json()) as any).catalog_revision, catalog.catalog_revision);
});
