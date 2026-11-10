import { once } from 'node:events';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { z } from 'zod';
import { catalogSchema } from '../src/lib/schema.ts';
import { createMcpHttpServer } from '../src/server/mcp.ts';
import { buildPlugin, pluginConfig, repositoryRoot, sha256, validatePlugin } from './plugin/package.ts';
import { installProbe, runCodex } from './plugin/codex.ts';
import { assessTrace, evaluationCaseSchema, parseEvents } from './plugin/traces.ts';

const { values } = parseArgs({ options: {
  state: { type: 'string' }, prepare: { type: 'boolean', default: false }, run: { type: 'boolean', default: false },
  'gallery-url': { type: 'string' }, case: { type: 'string', multiple: true }, codex: { type: 'string' },
} });
if (!values.state || values.prepare === values.run) throw new Error('选择 --prepare 或 --run，并提供 --state <仓库外的新隔离目录>；可用 --case <ID> 仅运行一条');
const state = path.resolve(values.state);
const relative = path.relative(repositoryRoot, state);
if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) throw new Error('模型评测目录必须在内容仓库之外，保证两个项目没有库的副本');
const resources = new AsyncDisposableStack();

async function listen(server: Server, port = 0) {
  // Register cleanup before acquiring a port. Every failure path releases all services in LIFO order.
  resources.defer(async () => {
    if (server.listening) await new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); });
  });
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('未取得测试端口');
  return address.port;
}

try {
  if (values.prepare) {
    if (!values['gallery-url']) throw new Error('--prepare 需要显式 --gallery-url；测试可用回环URL，不作为公开安装入口');
    await mkdir(path.dirname(state), { recursive: true }); await mkdir(state, { recursive: false });
  }
  const stored = values.run ? JSON.parse(await readFile(path.join(state, 'evaluation-state.json'), 'utf8')) : null;
  const catalog = catalogSchema.parse(JSON.parse(await readFile(values.prepare ? path.join(repositoryRoot, 'generated/catalog.json') : path.join(state, 'catalog.json'), 'utf8')));
  const app = createMcpHttpServer(catalog); resources.defer(() => app.close());
  const corePort = await listen(app.httpServer);
  let unavailable = false;
  const serviceRequests: { method: string; status: number }[] = [];
  const proxy = createServer((request, response) => {
    if (unavailable) {
      serviceRequests.push({ method: request.method ?? 'GET', status: 503 });
      response.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '0' });
      response.end(JSON.stringify({ error: 'UNAVAILABLE', retryable: true, message: 'Deliberate evaluation outage' })); return;
    }
    const upstream = httpRequest({ hostname: '127.0.0.1', port: corePort, path: request.url, method: request.method, headers: { ...request.headers, host: `127.0.0.1:${corePort}` } }, received => {
      serviceRequests.push({ method: request.method ?? 'GET', status: received.statusCode ?? 502 });
      response.writeHead(received.statusCode ?? 502, received.headers); received.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.on('error', () => upstream.destroy()); request.pipe(upstream);
  });
  const proxyPort = await listen(proxy, stored?.mcp_port ?? 0);
  if (values.prepare) {
    const built = await buildPlugin({ output: path.join(state, 'package'), mcpUrl: `http://127.0.0.1:${proxyPort}/mcp`, galleryUrl: values['gallery-url']!, mode: 'evaluation' });
    const installation = await installProbe({ packageRoot: built.output, state: path.join(state, 'installation'), codex: values.codex });
    const info = { schema_version: 1, mcp_port: proxyPort, package_root: built.output, home: installation.home, projects: installation.projects, cli: installation.cli, plugin_version: pluginConfig.version, catalog_revision: catalog.catalog_revision, archive_sha256: built.report.archive_sha256, prepared_at: new Date().toISOString() };
    await writeFile(path.join(state, 'catalog.json'), JSON.stringify(catalog));
    await writeFile(path.join(state, 'evaluation-state.json'), `${JSON.stringify(info, null, 2)}\n`);
    console.log(JSON.stringify({ ...info, next: '在此隔离home完成认证后，使用同一 --state --run [--case p01-avatar]；脚本不会读取或复制原有认证', services_running_after_exit: false }, null, 2));
  } else {
    if (stored.catalog_revision !== catalog.catalog_revision) throw new Error('评测内容版本发生漂移');
    await validatePlugin(path.join(stored.package_root, 'marketplace/plugins', pluginConfig.name));
    const installation = JSON.parse(await readFile(path.join(state, 'installation/install-report.json'), 'utf8'));
    if (stored.home !== installation.home || JSON.stringify(stored.projects) !== JSON.stringify(installation.projects)) throw new Error('隔离安装信息不一致');
    const cases = z.array(evaluationCaseSchema).parse(JSON.parse(await readFile(path.join(repositoryRoot, 'evals/plugin-cases.json'), 'utf8')));
    const selected = values.case?.length ? cases.filter(item => values.case!.includes(item.id)) : cases;
    if (!selected.length || values.case?.some(id => !cases.some(item => item.id === id))) throw new Error('未知评测 case ID');
    const runRoot = path.join(state, 'runs'); await mkdir(runRoot, { recursive: true });
    const runId = `run-${String((await readdir(runRoot)).filter(name => /^run-\d+$/.test(name)).length + 1).padStart(4, '0')}`;
    const output = path.join(runRoot, runId); await mkdir(output);
    // Native image generation is not represented in the CLI's MCP JSONL events.
    // Disable it explicitly so this is a controlled no-image-tool fixture, with only the opt-in recording probe below.
    const common = ['exec', '--disable', 'image_generation', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never'];
    const capabilities = { native_image_generation: 'disabled via --disable image_generation', library: ['search_prompts', 'get_prompt', 'render_prompt'], image_tool: 'only the recording MCP probe for handoff-probe cases; no image is created' };
    const baseOptions = { home: stored.home as string, cwd: stored.projects[0] as string, codex: values.codex, timeout: 180_000 };
    // A normal CLI header is direct host evidence of the resolved default model. Never guess from cache or assistant prose.
    const header = await runCodex([...common, 'Reply with READY only.'], baseOptions);
    await writeFile(path.join(output, 'model-header.txt'), header.stderr);
    const model = header.stderr.match(/^model:\s*(.+)$/m)?.[1]?.trim();
    if (header.code !== 0 || !model) throw new Error(`认证或实际模型证据未就绪；参见 ${path.join(output, 'model-header.txt')}`);
    const recordedHandoffs: { prompt: string }[] = [];
    const imageHandler = createMcpHandler(() => {
      const server = new McpServer({ name: 'image-handoff-probe', version: '1.0.0' });
      server.registerTool('generate_image', {
        description: 'TEST ONLY: record a prompt handoff to an image-generation tool. No image is created; no paid API is called. Accepts only a positive prompt, with no separate negative or parameter fields.',
        inputSchema: z.object({ prompt: z.string().min(1) }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      }, ({ prompt }) => { recordedHandoffs.push({ prompt }); return { content: [{ type: 'text', text: JSON.stringify({ accepted_for_handoff_probe: true, image_generated: false, prompt_sha256: sha256(prompt) }) }] }; });
      return server;
    });
    resources.defer(() => imageHandler.close());
    const nodeImageHandler = toNodeHandler(imageHandler);
    const imageServer = createServer((request, response) => { void nodeImageHandler(request, response).catch(() => { if (!response.headersSent) response.writeHead(500); response.end(); }); });
    const imagePort = await listen(imageServer);
    const summaries = [];
    for (const scenario of selected) {
      unavailable = scenario.kind === 'unavailable'; serviceRequests.length = 0; recordedHandoffs.length = 0;
      const extra = scenario.kind === 'handoff-probe' ? ['-c', `mcp_servers.image-handoff-probe.url="http://127.0.0.1:${imagePort}/mcp"`] : [];
      console.log(`Running ${scenario.id} in project ${scenario.project + 1} (fresh session)`);
      const result = await runCodex([...common, ...extra, '--json', scenario.prompt], { ...baseOptions, cwd: stored.projects[scenario.project] });
      await writeFile(path.join(output, `${scenario.id}.jsonl`), result.stdout);
      await writeFile(path.join(output, `${scenario.id}.stderr.txt`), result.stderr);
      const events = parseEvents(result.stdout);
      const assessment = assessTrace(events, scenario, catalog);
      const hostLimitations = /blocked by policy|tool.*(?:denied|rejected)|failed to (?:read|load).*skill/i.test(result.stderr) ? ['Host tool/Skill read restriction; inspect the preserved stderr. This is not a complete-client-support pass.'] : [];
      const summary = { ...assessment, cli_exit_code: result.code, fresh_thread_id: events.find(event => event.type === 'thread.started')?.thread_id ?? null, project: stored.projects[scenario.project], service_requests: [...serviceRequests], image_handoff_probe: [...recordedHandoffs], host_limitations: hostLimitations, stderr_evidence: `${scenario.id}.stderr.txt` };
      summaries.push(summary);
      const report = { host: `${os.platform()} ${os.release()} ${os.arch()}`, cli: stored.cli, model, model_evidence: 'model-header.txt', capabilities, plugin_version: stored.plugin_version, archive_sha256: stored.archive_sha256, catalog_revision: catalog.catalog_revision, installed_once: true, projects: stored.projects, cases: summaries, positive_search_count: summaries.filter(item => item.kind === 'positive' && item.activated).length, host_limitations: [...new Set(summaries.flatMap(item => item.host_limitations))], support_status: 'experimental; full client support requires clean-host verification', manual_review: 'pending', real_image_generation: 'disabled in this fixture; handoff probes only', run_id: runId, recorded_at: new Date().toISOString() };
      await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(JSON.stringify({ report: path.join(output, 'report.json'), cases_run: summaries.length, manual_review: 'pending', real_image_generation: 'not-run' }, null, 2));
  }
} finally { await resources.disposeAsync(); }
