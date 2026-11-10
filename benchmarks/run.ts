import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { catalogSchema, getResultSchema, renderResultSchema, searchResultSchema } from '../src/lib/schema.ts';
import { createMcpHttpServer } from '../src/server/mcp.ts';
import { runtimeConfig, serviceVersion } from '../src/server/config.ts';
import { syntheticCatalog } from './fixture.ts';

const { values } = parseArgs({ options: { out: { type: 'string', default: 'artifacts/benchmark/report.json' }, seconds: { type: 'string', default: '300' }, warmup: { type: 'string', default: '15' }, concurrency: { type: 'string', default: '20' }, 'require-resources': { type: 'boolean', default: false } } });
const seconds = Number(values.seconds), warmup = Number(values.warmup), concurrency = Number(values.concurrency);
if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600 || !Number.isInteger(warmup) || warmup < 1 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) throw new Error('Invalid benchmark duration/concurrency');
async function cgroupFile(filename: string) { try { return (await readFile(`/sys/fs/cgroup/${filename}`, 'utf8')).trim(); } catch { return null; } }
const cpuMax = await cgroupFile('cpu.max'), memoryMax = await cgroupFile('memory.max');
const [quota, period] = cpuMax?.split(' ').map(Number) ?? [];
const limitedCpus = quota && period ? quota / period : null;
const limitedMemory = memoryMax && /^\d+$/.test(memoryMax) ? Number(memoryMax) : null;
const controlled = limitedCpus === 2 && limitedMemory === 2 * 1024 ** 3;
if (values['require-resources'] && !controlled) throw new Error(`Required cgroup limits missing: cpu.max=${cpuMax}, memory.max=${memoryMax}`);
const source = catalogSchema.parse(JSON.parse(await readFile(new URL('../generated/catalog.json', import.meta.url), 'utf8')));
const sdkVersions: Record<string, string> = {};
for (const name of ['server', 'client', 'node']) sdkVersions[`@modelcontextprotocol/${name}`] = JSON.parse(await readFile(new URL(`../node_modules/@modelcontextprotocol/${name}/package.json`, import.meta.url), 'utf8')).version;
const catalog = await syntheticCatalog(source);
const serverSamples: Record<string, number[]> = { search_prompts: [], get_prompt: [], render_prompt: [] };
const clientSamples: number[] = [];
const errors: Record<string, number> = {};
let recording = false, completed = 0;
const app = createMcpHttpServer(catalog, {
  config: runtimeConfig({ MCP_RATE_LIMIT: '1000000', MCP_GLOBAL_RATE_LIMIT: '1000000' }),
  log: event => {
    if (!recording || !serverSamples[event.tool]) return;
    serverSamples[event.tool]!.push(event.elapsed_ms);
    if (event.error_code || event.http_status >= 400) { const code = event.error_code ?? `HTTP_${event.http_status}`; errors[code] = (errors[code] ?? 0) + 1; }
  },
});
const clients: Client[] = [];
let actualDuration = 0;
try {
  app.httpServer.listen(0, '127.0.0.1'); await once(app.httpServer, 'listening');
  const address = app.httpServer.address(); assert.ok(address && typeof address !== 'string');
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  for (let index = 0; index < concurrency; index++) {
    const client = new Client({ name: `synthetic-benchmark-${index}`, version: serviceVersion }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    clients.push(client); await client.connect(new StreamableHTTPClientTransport(url)); await client.listTools();
  }
  async function worker(client: Client, deadline: number, measuring: boolean) {
    let step = 0, cursor: string | null = null;
    let selected = catalog.prompts[0]!;
    while (performance.now() < deadline) {
      const start = performance.now();
      try {
        if (step % 3 === 0) {
          const result = searchResultSchema.parse((await client.callTool({ name: 'search_prompts', arguments: { query: 'fixture', limit: 5, ...(cursor ? { cursor } : {}) } })).structuredContent);
          assert.ok(result.ok && result.data.items.length > 0);
          assert.equal(result.catalog_revision, catalog.catalog_revision);
          const first = result.data.items[0]!; selected = catalog.prompts.find(prompt => prompt.id === first.id)!;
          cursor = result.data.next_cursor;
        } else if (step % 3 === 1) {
          const result = getResultSchema.parse((await client.callTool({ name: 'get_prompt', arguments: { id: selected.id, expected_revision: selected.prompt_revision } })).structuredContent);
          assert.ok(result.ok); assert.equal(result.data.template, selected.template);
        } else {
          const result = renderResultSchema.parse((await client.callTool({ name: 'render_prompt', arguments: { id: selected.id, expected_revision: selected.prompt_revision, variables: {} } })).structuredContent);
          assert.ok(result.ok); assert.equal(result.data.prompt, selected.examples[0]!.effective_prompt);
        }
        if (measuring) { completed++; clientSamples.push(performance.now() - start); }
      } catch (error) {
        if (measuring) { const code = error instanceof Error ? error.name : 'UnknownError'; errors[code] = (errors[code] ?? 0) + 1; }
      }
      step++;
    }
  }
  await Promise.all(clients.map(client => worker(client, performance.now() + warmup * 1000, false)));
  const started = performance.now(); recording = true;
  await Promise.all(clients.map(client => worker(client, started + seconds * 1000, true)));
  actualDuration = performance.now() - started; recording = false;
} finally {
  await Promise.allSettled(clients.map(client => client.close())); await app.close();
}
function percentiles(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (percent: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percent) - 1)]! : null;
  return { samples: sorted.length, p50_ms: percentile(0.5), p95_ms: percentile(0.95), max_ms: sorted.at(-1) ?? null };
}
const server = percentiles(Object.values(serverSamples).flat());
const errorsTotal = Object.values(errors).reduce((sum, number) => sum + number, 0);
const targetRun = controlled && seconds >= 300 && concurrency === 20 && actualDuration >= 300000;
const byTool = Object.fromEntries(Object.entries(serverSamples).map(([tool, samples]) => [tool, percentiles(samples)]));
const passed = targetRun && errorsTotal === 0 && server.p95_ms !== null && server.p95_ms <= 300 && server.samples === completed && Object.values(byTool).every(tool => tool.samples > 0 && tool.p95_ms !== null && tool.p95_ms <= 300);
const report = {
  schema_version: 1, measured_at: new Date().toISOString(), source_revision: process.env.BENCHMARK_SOURCE_REVISION ?? 'not supplied; local run', acceptance: targetRun ? (passed ? 'passed' : 'failed') : 'not-an-acceptance-run',
  environment: { platform: process.platform, arch: process.arch, kernel: os.release(), node: process.version, cpu_model: os.cpus()[0]?.model, visible_logical_cpus: os.cpus().length, cpu_max: cpuMax, memory_max: memoryMax, cgroup_cpus: limitedCpus, cgroup_memory_bytes: limitedMemory, controlled_2cpu_2gib: controlled, process_peak_rss_bytes: process.resourceUsage().maxRSS * 1024, client_and_server: controlled ? 'same Node process and cgroup; both consume the 2 CPU / 2 GiB budget' : 'same Node process; resource limits were not verified' },
  fixture: { synthetic: true, published: false, prompt_count: catalog.prompts.length, catalog_revision: catalog.catalog_revision, source_catalog_revision: source.catalog_revision },
  service_version: serviceVersion, sdk_versions: sdkVersions, protocol: '2026-07-28', concurrency, warmup_seconds: warmup, requested_seconds: seconds, actual_seconds: actualDuration / 1000,
  limits: { per_client_requests_per_60s: 1000000, global_requests_per_60s: 1000000, request_body_bytes: 128 * 1024 },
  timing_definition: 'Server-Timing app: Fetch handler entry after Node has buffered the bounded request body, through host/rate policy, SDK parsing/validation, core search/get/render and response construction; excludes request body transfer, response transfer and client validation. Local end-to-end times are reported separately.',
  server, by_tool: byTool, local_end_to_end: percentiles(clientSamples), completed, errors_total: errorsTotal, errors,
};
await mkdir(path.dirname(path.resolve(values.out!)), { recursive: true }); await writeFile(values.out!, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (targetRun && !passed) process.exitCode = 1;
