import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { get as httpGet } from 'node:http';
import { Client, INVALID_PARAMS, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/client/validators/ajv';
import { createMcpHttpServer } from '../src/server/mcp.ts';
import { createSearchCatalog, getPrompt, renderPrompt, searchPrompts } from '../src/lib/catalog.ts';
import {
  failureSchema, getInputSchema, getResultSchema, renderInputSchema, renderResultSchema,
  searchInputSchema, searchResultSchema,
} from '../src/lib/schema.ts';
import { catalog, prompt } from './helpers.ts';

// https://fetch.spec.whatwg.org/#port-blocking — an OS-assigned port can still be forbidden by Fetch.
const fetchBlockedPorts = new Set([0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);

async function start() {
  const app = createMcpHttpServer(catalog);
  const rejected: number[] = [];
  try {
    for (let attempt = 1; attempt <= 8; attempt++) {
      app.httpServer.listen(0, '127.0.0.1'); await once(app.httpServer, 'listening');
      const address = app.httpServer.address(); assert.ok(address && typeof address !== 'string');
      const origin = `http://127.0.0.1:${address.port}`;
      const blocked = fetchBlockedPorts.has(address.port);
      console.log(JSON.stringify({ fixture: 'mcp-test-listener', attempt, address: address.address, port: address.port, url: `${origin}/mcp`, blocked_by_fetch: blocked }));
      if (!blocked) return { ...app, origin };
      // Reallocate only a confirmed forbidden port, before any client or contract assertion runs.
      rejected.push(address.port);
      await new Promise<void>((resolve, reject) => app.httpServer.close(error => error ? reject(error) : resolve()));
    }
    throw new Error(`No Fetch-compatible ephemeral port after 8 allocations; rejected ports: ${rejected.join(', ')}`);
  } catch (error) { await app.close(); throw error; }
}

const validator = new AjvJsonSchemaValidator();

test('multiword match reasons reflect real fields, deduplicate sources and agree across Catalog, search index and modern/legacy HTTP MCP', async t => {
  const app = await start(); t.after(() => app.close());
  const index = createSearchCatalog(catalog);
  const cases = [
    { query: 'no logo', ids: ['fixture-avatar', 'fixture-character', 'fixture-comic', 'fixture-scenery', 'fixture-sticker', 'fixture-wallpaper'], reasons: ['提示词正文关键词匹配'] },
    { query: 'no logo watermark ui delicate pencil linework translucent', ids: ['fixture-avatar'], reasons: ['提示词正文关键词匹配'] },
    { query: 'avatar 薄荷 no logo', ids: ['fixture-avatar'], reasons: ['用途、画风或模型词表匹配', '名称、关键词或简介匹配', '提示词正文关键词匹配'] },
  ];
  for (const mode of ['modern', 'legacy'] as const) {
    const client = new Client({ name: `${mode}-match-reasons-test`, version: '1.0.0' }, { versionNegotiation: { mode: mode === 'modern' ? { pin: '2026-07-28' } : 'legacy' } });
    t.after(() => client.close());
    await client.connect(new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`)));
    const listing = await client.listTools();
    const schema = listing.tools.find(tool => tool.name === 'search_prompts')!.outputSchema!;
    for (const { query, ids, reasons } of cases) {
      const full = searchPrompts(catalog, { query, limit: 20 }); assert.ok(full.ok);
      assert.deepEqual(full.data.items.map(item => item.id), ids);
      for (const item of full.data.items) assert.deepEqual(item.match_reasons, reasons);
      assert.deepEqual(searchPrompts(index, { query, limit: 20 }), full);
      const response = await client.callTool({ name: 'search_prompts', arguments: { query, limit: 20 } });
      assert.equal(response.isError, false);
      const checked = validator.getValidator(schema)(response.structuredContent); assert.ok(checked.valid, checked.errorMessage);
      const structured = response.structuredContent as { result?: unknown };
      assert.deepEqual(searchResultSchema.parse(structured.result ?? structured), full);
    }
  }
});

test('real Streamable HTTP client discovers typed tools and calls search → get → render against the gallery snapshot', async t => {
  const app = await start();
  t.after(() => app.close());
  const client = new Client({ name: 'catalog-integration-test', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`)));
  const listing = await client.listTools();
  assert.deepEqual(listing.tools.map(tool => tool.name).sort(), ['get_prompt', 'render_prompt', 'search_prompts']);
  for (const tool of listing.tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.outputSchema);
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  }
  async function call(name: string, args: Record<string, unknown>) {
    const response = await client.callTool({ name, arguments: args });
    const tool = listing.tools.find(item => item.name === name)!;
    const validation = validator.getValidator(tool.outputSchema!)(response.structuredContent);
    assert.ok(validation.valid, validation.errorMessage);
    const text = response.content.find(block => block.type === 'text');
    assert.ok(text && text.type === 'text');
    assert.deepEqual(JSON.parse(text.text), response.structuredContent);
    return response;
  }
  const searchResponse = await call('search_prompts', { query: '晴空' });
  const found = searchResultSchema.parse(searchResponse.structuredContent);
  assert.ok(found.ok); assert.equal(searchResponse.isError, false);
  assert.deepEqual(found, searchPrompts(catalog, { query: '晴空' }));
  const item = found.data.items[0]!;
  assert.equal(item.id, prompt.id); assert.equal(item.prompt_revision, prompt.prompt_revision);

  const detailResponse = await call('get_prompt', { id: item.id, expected_revision: item.prompt_revision, include_examples: true });
  const detail = getResultSchema.parse(detailResponse.structuredContent);
  assert.ok(detail.ok); assert.deepEqual(detail, getPrompt(catalog, { id: item.id, expected_revision: item.prompt_revision, include_examples: true }));
  assert.deepEqual(detail.data, prompt);
  const args = { id: item.id, expected_revision: detail.data.prompt_revision, variables: { subject: 'an adult anime traveler holding a sketchbook' } };
  const renderedResponse = await call('render_prompt', args);
  const rendered = renderResultSchema.parse(renderedResponse.structuredContent);
  assert.ok(rendered.ok); assert.deepEqual(rendered, renderPrompt(catalog, args));
  assert.equal(rendered.catalog_revision, catalog.catalog_revision);
  assert.equal(rendered.data.prompt_revision, prompt.prompt_revision);
  assert.ok(rendered.data.prompt.includes(args.variables.subject));
  const healthResponse = await fetch(`${app.origin}/health`);
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json() as { catalog_revision: string }).catalog_revision, catalog.catalog_revision);
});

test('HTTP tool business failures retain isError, machine-readable codes and the advertised output schema', async t => {
  const app = await start(); t.after(() => app.close());
  const client = new Client({ name: 'business-errors-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`)));
  const { tools } = await client.listTools();
  const base = { id: prompt.id, expected_revision: prompt.prompt_revision, variables: {} };
  const cases = [
    ['get_prompt', { id: 'missing-id' }, 'NOT_FOUND'],
    ['render_prompt', { ...base, id: 'missing-id' }, 'NOT_FOUND'],
    ['get_prompt', { id: prompt.id, expected_revision: 'stale' }, 'REVISION_MISMATCH'],
    ['render_prompt', { ...base, expected_revision: 'stale' }, 'REVISION_MISMATCH'],
    ['render_prompt', { ...base, variables: { subject: '' } }, 'MISSING_VARIABLES'],
    ['render_prompt', { ...base, variables: { unknown: 'x' } }, 'INVALID_VARIABLES'],
    ['search_prompts', { styles: ['missing-style'] }, 'INVALID_INPUT'],
    ['search_prompts', { cursor: 'invalid' }, 'INVALID_CURSOR'],
  ] as const;
  for (const [name, args, expectedCode] of cases) {
    const response = await client.callTool({ name, arguments: args });
    assert.equal(response.isError, true);
    const tool = tools.find(item => item.name === name)!;
    const checked = validator.getValidator(tool.outputSchema!)(response.structuredContent);
    assert.ok(checked.valid, checked.errorMessage);
    const result = (name === 'search_prompts' ? searchResultSchema : name === 'get_prompt' ? getResultSchema : renderResultSchema).parse(response.structuredContent);
    assert.ok(!result.ok); assert.equal(result.error.code, expectedCode);
    assert.equal(result.catalog_revision, catalog.catalog_revision);
    assert.ok(!Object.hasOwn(result, 'data'));
  }
});

test('legacy MCP HTTP clients receive valid SDK-projected schemas and the same business result', async t => {
  const app = await start(); t.after(() => app.close());
  const client = new Client({ name: 'legacy-client-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`)));
  const listing = await client.listTools();
  const response = await client.callTool({ name: 'get_prompt', arguments: { id: prompt.id } });
  const schema = listing.tools.find(tool => tool.name === 'get_prompt')!.outputSchema!;
  assert.ok(validator.getValidator(schema)(response.structuredContent).valid);
  // The official SDK wraps non-object-root union schemas on the 2025 wire era.
  const structured = response.structuredContent as { result?: unknown };
  const result = getResultSchema.parse(structured.result ?? structured);
  assert.deepEqual(result, getPrompt(catalog, { id: prompt.id }));
});

for (const mode of ['modern', 'legacy'] as const) {
  test(`${mode} HTTP clients receive structured INVALID_INPUT for invalid tool arguments while discovery retains strict schemas`, async t => {
    const app = await start(); t.after(() => app.close());
    const client = new Client({ name: `${mode}-input-errors-test`, version: '1.0.0' }, {
      versionNegotiation: { mode: mode === 'modern' ? { pin: '2026-07-28' } : 'legacy' },
    });
    t.after(() => client.close());
    await client.connect(new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`)));
    const { tools } = await client.listTools();
    const operations = {
      search_prompts: { schema: searchInputSchema, run: searchPrompts },
      get_prompt: { schema: getInputSchema, run: getPrompt },
      render_prompt: { schema: renderInputSchema, run: renderPrompt },
    };
    for (const [name, operation] of Object.entries(operations)) {
      const tool = tools.find(item => item.name === name)!;
      assert.deepEqual(tool.inputSchema, operation.schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' }));
      assert.equal(tool.inputSchema.additionalProperties, false);
    }
    const renderBase = { id: prompt.id, expected_revision: prompt.prompt_revision, variables: {} };
    const invalidCases: [keyof typeof operations, Record<string, unknown>][] = [
      ['search_prompts', { query: 'a'.repeat(257) }],
      ['search_prompts', { query: '😀'.repeat(257) }],
      ['search_prompts', { query: 123 }],
      ['search_prompts', { limit: 21 }],
      ['search_prompts', { extra: true }],
      ['search_prompts', { model: '　 ' }],
      ['get_prompt', {}],
      ['get_prompt', { id: prompt.id, include_examples: 'true' }],
      ['render_prompt', { id: prompt.id, variables: {} }],
      ['render_prompt', { ...renderBase, variables: { 'bad-variable-name': 'x' } }],
      ['render_prompt', { ...renderBase, variables: { subject: 123 } }],
      ['render_prompt', { ...renderBase, model: '　 ' }],
      ['render_prompt', { ...renderBase, variables: { subject: '😀'.repeat(2001) } }],
      ['render_prompt', { ...renderBase, variables: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`v${i}`, 'x'])) }],
    ];
    for (const [name, args] of invalidCases) {
      const response = await client.callTool({ name, arguments: args });
      assert.equal(response.isError, true, `${name} must fail`);
      const tool = tools.find(item => item.name === name)!;
      const output = validator.getValidator(tool.outputSchema!)(response.structuredContent);
      assert.ok(output.valid, output.errorMessage);
      const structured = response.structuredContent as { result?: unknown };
      const result = failureSchema.parse(mode === 'legacy' ? structured.result ?? structured : structured);
      assert.equal(result.error.code, 'INVALID_INPUT');
      assert.equal(result.error.retryable, false);
      assert.ok(Array.isArray(result.error.details.issues) && result.error.details.issues.length > 0);
      assert.equal(result.catalog_revision, catalog.catalog_revision);
      assert.deepEqual(result, operations[name].run(catalog, args));
      assert.ok(!Object.hasOwn(result, 'data'));
      const text = response.content.find(block => block.type === 'text');
      assert.ok(text && text.type === 'text');
      assert.deepEqual(JSON.parse(text.text), result);
    }
    // Unicode length still counts characters rather than UTF-16 code units.
    const boundary = await client.callTool({ name: 'search_prompts', arguments: { query: '😀'.repeat(256) } });
    assert.equal(boundary.isError, false);
    const structured = boundary.structuredContent as { result?: unknown };
    const result = searchResultSchema.parse(mode === 'legacy' ? structured.result ?? structured : structured);
    assert.ok(result.ok); assert.deepEqual(result.data.items, []);
    // Unknown tool names remain SDK protocol errors, not business responses.
    await assert.rejects(client.callTool({ name: 'missing_tool', arguments: {} }), { code: INVALID_PARAMS });
  });
}

test('HTTP runtime rejects oversized bodies and untrusted Host/Origin headers', async t => {
  const app = await start(); t.after(() => app.close());
  const oversized = await fetch(`${app.origin}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(128 * 1024 + 1) });
  assert.equal(oversized.status, 413);
  const origin = await fetch(`${app.origin}/health`, { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(origin.status, 403);
  // Native fetch protects Host, so use node:http to exercise an actual forged header.
  const hostStatus = await new Promise<number>((resolve, reject) => {
    httpGet(`${app.origin}/health`, { headers: { Host: 'untrusted.example' } }, response => {
      response.resume(); resolve(response.statusCode!);
    }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
  const noRoute = await fetch(`${app.origin}/unrelated`);
  assert.equal(noRoute.status, 404);
});
