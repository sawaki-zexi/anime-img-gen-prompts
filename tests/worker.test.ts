import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { bundleWorker } from '../scripts/release/worker-bundle.ts';
import { buildRelease } from '../scripts/build-release.ts';
import { verifyRelease } from '../scripts/release/verify.ts';
import { sha256 } from '../scripts/plugin/package.ts';
import { runtimeConfig } from '../src/server/config.ts';
import { failureSchema, getResultSchema, searchResultSchema } from '../src/lib/schema.ts';
import { catalog, projectRoot } from './helpers.ts';

test('self-contained Worker ESM serves exact assets with safe caching and both standard MCP protocol generations', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'anime-worker-test-'));
  t.after(async () => { if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('anime-worker-test-')) throw new Error('Unexpected worker fixture path'); await rm(directory, { recursive: true, force: true }); });
  const staticDir = path.join(directory, 'static'); await mkdir(path.join(staticDir, '_astro'), { recursive: true }); await mkdir(path.join(staticDir, 'images'));
  await writeFile(path.join(staticDir, 'index.html'), '<!doctype html><title>worker fixture</title>');
  await writeFile(path.join(staticDir, '_astro/file.abc123.js'), 'console.log(1)');
  const image = await readFile(path.join(projectRoot, 'public/images/summer-anime-illustrator.webp')); await writeFile(path.join(staticDir, 'images/real.webp'), image);
  const output = path.join(directory, 'worker.mjs');
  const bundled = await bundleWorker({ staticDir, output, catalog, config: runtimeConfig() }); assert.equal(bundled.assetCount, 3);
  const { default: worker } = await import(pathToFileURL(output).href);
  const home = await worker.fetch(new Request('http://localhost/')); assert.equal(home.status, 200); assert.ok((await home.text()).includes('worker fixture'));
  const picture = await worker.fetch(new Request('http://localhost/images/real.webp')); assert.deepEqual(Buffer.from(await picture.arrayBuffer()), image); assert.equal(picture.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  const unchanged = await worker.fetch(new Request('http://localhost/images/real.webp', { headers: { 'If-None-Match': picture.headers.get('etag')! } })); assert.equal(unchanged.status, 304);
  assert.match((await worker.fetch(new Request('http://localhost/_astro/file.abc123.js'))).headers.get('cache-control'), /immutable/);
  assert.equal((await worker.fetch(new Request('http://localhost/absent'))).status, 404);
  for (const mode of ['legacy', { pin: '2026-07-28' }] as const) {
    const client = new Client({ name: 'compiled-worker-test', version: '1' }, { versionNegotiation: { mode } }); t.after(() => client.close());
    await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), { fetch: (input, init) => worker.fetch(new Request(input, init)) }));
    assert.equal((await client.listTools()).tools.length, 3);
    const unwrap = (value: any) => value.result ?? value;
    const search = searchResultSchema.parse(unwrap((await client.callTool({ name: 'search_prompts', arguments: { limit: 1 } })).structuredContent)); assert.ok(search.ok); assert.equal(search.catalog_revision, catalog.catalog_revision);
    const detail = getResultSchema.parse(unwrap((await client.callTool({ name: 'get_prompt', arguments: { id: search.data.items[0]!.id } })).structuredContent)); assert.ok(detail.ok);
    const failure = failureSchema.parse(unwrap((await client.callTool({ name: 'search_prompts', arguments: { query: 'x'.repeat(257) } })).structuredContent)); assert.equal(failure.error.code, 'INVALID_INPUT');
  }
});

test('immutable release builds refuse an existing directory before changing its prior contents', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'anime-release-existing-'));
  t.after(async () => { if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('anime-release-existing-')) throw new Error('Unexpected release fixture path'); await rm(directory, { recursive: true, force: true }); });
  await writeFile(path.join(directory, 'known-good.txt'), 'previous release');
  await assert.rejects(buildRelease({ output: directory }), /已存在/);
  assert.equal(await readFile(path.join(directory, 'known-good.txt'), 'utf8'), 'previous release');
});

test('offline release verification detects Worker tampering and snapshot/manifest divergence before a rollback', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'anime-release-verify-'));
  t.after(async () => { if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('anime-release-verify-')) throw new Error('Unexpected verification fixture path'); await rm(directory, { recursive: true, force: true }); });
  await mkdir(path.join(directory, 'dist/server'), { recursive: true }); await mkdir(path.join(directory, 'dist/.openai'), { recursive: true }); await mkdir(path.join(directory, 'snapshot'));
  const worker = 'export default { fetch() { return new Response("fixture") } };';
  const manifest = JSON.stringify({ stage: 'service-candidate', project_id: 'isolated-fixture', catalog_revision: catalog.catalog_revision, prompt_count: catalog.prompts.length, gallery_url: `${catalog.site_url}${catalog.base_path}` });
  await writeFile(path.join(directory, 'dist/server/index.js'), worker); await writeFile(path.join(directory, 'release-manifest.json'), manifest);
  await writeFile(path.join(directory, 'dist/.openai/hosting.json'), JSON.stringify({ project_id: 'isolated-fixture' }));
  await writeFile(path.join(directory, 'snapshot/catalog.json'), JSON.stringify(catalog));
  await writeFile(path.join(directory, 'build-receipt.json'), JSON.stringify({ worker_sha256: sha256(worker), manifest_sha256: sha256(manifest), catalog_revision: catalog.catalog_revision }));
  assert.equal((await verifyRelease(directory)).passed, true);
  await writeFile(path.join(directory, 'dist/server/index.js'), `${worker}\n// changed`); await assert.rejects(verifyRelease(directory), /摘要/);
  await writeFile(path.join(directory, 'dist/server/index.js'), worker);
  await writeFile(path.join(directory, 'snapshot/catalog.json'), JSON.stringify({ ...catalog, prompts: [] })); await assert.rejects(verifyRelease(directory), /摘要/);
});
