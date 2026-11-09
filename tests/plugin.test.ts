import assert from 'node:assert/strict';
import { once } from 'node:events';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { crc32 } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import matter from 'gray-matter';
import { z } from 'zod';
import { getPrompt, renderPrompt, searchPrompts } from '../src/lib/catalog.ts';
import { createMcpHttpServer } from '../src/server/mcp.ts';
import { buildPlugin, endpoint, pluginConfig, repositoryRoot, sha256, validatePlugin } from '../scripts/plugin/package.ts';
import { isolatedCliEnvironment } from '../scripts/plugin/codex.ts';
import { verifyRemoteContract } from '../scripts/plugin/contract.ts';
import { assessTrace, evaluationCaseSchema, parseEvents } from '../scripts/plugin/traces.ts';
import { catalog, prompt } from './helpers.ts';

function resourcesFor(t: TestContext) {
  const resources = new AsyncDisposableStack(); t.after(() => resources.disposeAsync());
  return resources;
}
async function temporary(resources: AsyncDisposableStack) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'anime-plugin-test-'));
  resources.defer(async () => {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('anime-plugin-test-')) throw new Error('Unexpected plugin test cleanup path');
    await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  return directory;
}

test('release URLs reject loopback, private, reserved, example and secret-bearing addresses; evaluation loopback is explicit', () => {
  for (const url of ['http://prompts.site/mcp', 'https://localhost./mcp', 'https://localhost/mcp', 'https://127.0.0.1/mcp', 'https://2130706433/mcp', 'https://[::1]/mcp', 'https://192.168.1.5/mcp', 'https://100.64.1.1/mcp', 'https://198.51.100.1/mcp', 'https://example.com./mcp', 'https://foo.test/mcp', 'https://foo.internal/mcp', 'https://a:b@prompts.site/mcp', 'https://prompts.site/mcp?token=secret', 'https://prompts.site/mcp#secret']) assert.throws(() => endpoint(url, 'release'), url);
  assert.equal(endpoint('https://prompts.site/mcp', 'release'), 'https://prompts.site/mcp');
  assert.equal(endpoint('http://127.0.0.1:4321/mcp', 'evaluation'), 'http://127.0.0.1:4321/mcp');
  assert.throws(() => endpoint('http://remote.site/mcp', 'evaluation'));
});

test('one configuration produces schema-valid, byte-identical portable ZIP and Codex marketplace with linked remote Skill', async t => {
  const resources = resourcesFor(t), directory = await temporary(resources);
  const options = { mcpUrl: 'http://127.0.0.1:5432/mcp', galleryUrl: 'http://127.0.0.1:5433/', mode: 'evaluation' as const };
  const first = await buildPlugin({ ...options, output: path.join(directory, 'first') });
  const second = await buildPlugin({ ...options, output: path.join(directory, 'second') });
  assert.deepEqual(await validatePlugin(first.pluginRoot), { name: pluginConfig.name, version: pluginConfig.version, mode: options.mode, mcpUrl: options.mcpUrl, galleryUrl: options.galleryUrl, fileCount: 8 });
  const skill = matter(await readFile(path.join(first.pluginRoot, `skills/${pluginConfig.skillName}/SKILL.md`), 'utf8'));
  assert.ok(skill.data.description.includes(options.galleryUrl));
  assert.ok(skill.content.includes(`画廊入口：${options.galleryUrl}`));
  const otherGallery = await buildPlugin({ ...options, galleryUrl: 'http://127.0.0.1:8765/', output: path.join(directory, 'other-gallery') });
  const otherSkill = matter(await readFile(path.join(otherGallery.pluginRoot, `skills/${pluginConfig.skillName}/SKILL.md`), 'utf8'));
  assert.ok(otherSkill.data.description.includes('http://127.0.0.1:8765/'));
  assert.ok(!otherSkill.data.description.includes(options.galleryUrl));
  const archive = await readFile(path.join(first.output, first.archiveName));
  assert.deepEqual(archive, await readFile(path.join(second.output, second.archiveName)));
  assert.equal(sha256(archive), first.report.archive_sha256);
  // Check the archive independently with Node's native CRC implementation.
  let offset = 0, entries = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8), size = archive.readUInt32LE(offset + 18), nameLength = archive.readUInt16LE(offset + 26), extraLength = archive.readUInt16LE(offset + 28);
    assert.equal(method, 0);
    const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength, bytes = archive.subarray(start, start + size);
    assert.equal(crc32(bytes), archive.readUInt32LE(offset + 14), name);
    assert.deepEqual(bytes, await readFile(path.join(first.pluginRoot, name)));
    assert.ok(!name.startsWith('/') && !name.includes('..'));
    entries++; offset = start + size;
  }
  assert.equal(entries, 8); assert.equal(archive.readUInt32LE(offset), 0x02014b50);
  assert.equal(archive.readUInt32LE(archive.length - 22), 0x06054b50);
  assert.equal(archive.readUInt16LE(archive.length - 12), entries);
  const marketplace = JSON.parse(await readFile(path.join(first.marketplaceRoot, '.agents/plugins/marketplace.json'), 'utf8'));
  assert.equal(path.resolve(first.marketplaceRoot, marketplace.plugins[0].source.path), first.pluginRoot);
  assert.deepEqual(marketplace.plugins[0].policy, { installation: 'AVAILABLE', authentication: 'ON_INSTALL' });
  await assert.rejects(buildPlugin({ ...options, output: first.output }), /EEXIST/);
  assert.deepEqual(archive, await readFile(path.join(first.output, first.archiveName)));
  // Use a separate source tree with real LF/CRLF files: do not rewrite the checkout under test.
  const sourceRoot = path.join(directory, 'source');
  await mkdir(path.join(sourceRoot, 'scripts/plugin'), { recursive: true });
  await mkdir(path.join(sourceRoot, 'public'));
  await copyFile(path.join(repositoryRoot, 'scripts/plugin/package.ts'), path.join(sourceRoot, 'scripts/plugin/package.ts'));
  await copyFile(path.join(repositoryRoot, 'package.json'), path.join(sourceRoot, 'package.json'));
  await cp(path.join(repositoryRoot, 'plugin'), path.join(sourceRoot, 'plugin'), { recursive: true });
  await symlink(path.join(repositoryRoot, 'node_modules'), path.join(sourceRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const iconLf = (await readFile(path.join(repositoryRoot, 'public/favicon.svg'), 'utf8')).replaceAll('\r\n', '\n');
  const sourceSkillPath = path.join(sourceRoot, 'plugin/skills', pluginConfig.skillName, 'SKILL.md');
  const skillLf = (await readFile(sourceSkillPath, 'utf8')).replaceAll('\r\n', '\n');
  await writeFile(path.join(sourceRoot, 'public/favicon.svg'), iconLf); await writeFile(sourceSkillPath, skillLf);
  const isolatedBuilder = await import(pathToFileURL(path.join(sourceRoot, 'scripts/plugin/package.ts')).href);
  const lfBuild = await isolatedBuilder.buildPlugin({ ...options, output: path.join(directory, 'lf-inputs') });
  await writeFile(path.join(sourceRoot, 'public/favicon.svg'), iconLf.replaceAll('\n', '\r\n')); await writeFile(sourceSkillPath, skillLf.replaceAll('\n', '\r\n'));
  const crlfBuild = await isolatedBuilder.buildPlugin({ ...options, output: path.join(directory, 'crlf-inputs') });
  assert.deepEqual(await readFile(path.join(lfBuild.output, lfBuild.archiveName)), await readFile(path.join(crlfBuild.output, crlfBuild.archiveName)));
  assert.deepEqual(archive, await readFile(path.join(lfBuild.output, lfBuild.archiveName)));
});

test('package validation detects changed connection, implicit discovery, asset bytes and missing references', async t => {
  const resources = resourcesFor(t), directory = await temporary(resources);
  const built = await buildPlugin({ output: path.join(directory, 'package'), mcpUrl: 'http://127.0.0.1:5432/mcp', galleryUrl: 'http://127.0.0.1:5433/', mode: 'evaluation' });
  const legacyPath = path.join(built.pluginRoot, '.mcp.json'), legacyBytes = await readFile(legacyPath);
  const legacy = JSON.parse(legacyBytes.toString()); legacy.mcpServers[pluginConfig.serverName].url = 'http://127.0.0.1:9999/mcp';
  await writeFile(legacyPath, JSON.stringify(legacy)); await assert.rejects(validatePlugin(built.pluginRoot), /漂移/); await writeFile(legacyPath, legacyBytes);
  const agentPath = path.join(built.pluginRoot, `skills/${pluginConfig.skillName}/agents/openai.yaml`), agent = await readFile(agentPath, 'utf8');
  await writeFile(agentPath, agent.replace('allow_implicit_invocation: true', 'allow_implicit_invocation: false')); await assert.rejects(validatePlugin(built.pluginRoot), /隐式/); await writeFile(agentPath, agent);
  const skillPath = path.join(built.pluginRoot, `skills/${pluginConfig.skillName}/SKILL.md`), skillBytes = await readFile(skillPath);
  const skill = matter(skillBytes.toString());
  const originalDescription = skill.data.description;
  skill.data.description = originalDescription.replace('http://127.0.0.1:5433/', 'http://127.0.0.1:9999/');
  await writeFile(skillPath, matter.stringify(skill.content, skill.data)); await assert.rejects(validatePlugin(built.pluginRoot), /描述回退入口/);
  skill.data.description = originalDescription;
  await writeFile(skillPath, matter.stringify(skill.content.replace('http://127.0.0.1:5433/', 'http://127.0.0.1:9999/'), skill.data)); await assert.rejects(validatePlugin(built.pluginRoot), /正文画廊地址/);
  await writeFile(skillPath, skillBytes);
  const icon = path.join(built.pluginRoot, 'assets/icon.svg'), iconBytes = await readFile(icon);
  await writeFile(icon, '<svg/>'); await assert.rejects(validatePlugin(built.pluginRoot), /哈希/); await writeFile(icon, iconBytes);
  await rm(icon); await assert.rejects(validatePlugin(built.pluginRoot), /ENOENT/);
});

test('release preflight really discovers, searches, reads and renders a service and compares the gallery snapshot', async t => {
  const resources = resourcesFor(t);
  const app = createMcpHttpServer(catalog); resources.defer(() => app.close());
  app.httpServer.listen(0, '127.0.0.1'); await once(app.httpServer, 'listening');
  const address = app.httpServer.address(); assert.ok(address && typeof address !== 'string');
  let revision = catalog.catalog_revision;
  const gallery = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(`<meta name="catalog-revision" content="${revision}">`); });
  resources.defer(() => new Promise<void>((resolve, reject) => { gallery.closeAllConnections(); gallery.close(error => error ? reject(error) : resolve()); }));
  gallery.listen(0, '127.0.0.1'); await once(gallery, 'listening');
  const galleryAddress = gallery.address(); assert.ok(galleryAddress && typeof galleryAddress !== 'string');
  const check = await verifyRemoteContract(`http://127.0.0.1:${address.port}/mcp`, `http://127.0.0.1:${galleryAddress.port}/`);
  assert.equal(check.catalog_revision, catalog.catalog_revision); assert.ok(catalog.prompts.some(prompt => prompt.id === check.real_id));
  assert.deepEqual(check.tools, ['get_prompt', 'render_prompt', 'search_prompts']);
  revision = 'sha256:stale';
  await assert.rejects(verifyRemoteContract(`http://127.0.0.1:${address.port}/mcp`, `http://127.0.0.1:${galleryAddress.port}/`), /内容版本/);
});

const scenario = evaluationCaseSchema.parse({ id: 'test-avatar', kind: 'positive', group: 'avatar', project: 0, prompt: '画个动漫头像。', variable_text: 'an adult traveler' });
const complete = (tool: string, args: unknown, value: unknown, server = 'anime-prompt-atelier') => ({ type: 'item.completed', item: { id: tool, type: 'mcp_tool_call', server, tool, arguments: args, result: { structuredContent: value } } });
function realTrace() {
  const found = searchPrompts(catalog, { query: '晴空' }); assert.ok(found.ok);
  const detail = getPrompt(catalog, { id: prompt.id, expected_revision: prompt.prompt_revision }); assert.ok(detail.ok);
  const args = { id: prompt.id, expected_revision: detail.data.prompt_revision, variables: { subject: 'an adult traveler' } };
  const rendered = renderPrompt(catalog, args); assert.ok(rendered.ok);
  const events: Record<string, any>[] = [complete('search_prompts', { query: '晴空' }, found), complete('get_prompt', { id: prompt.id, expected_revision: prompt.prompt_revision }, detail), complete('render_prompt', args, rendered), { type: 'item.completed', item: { type: 'agent_message', text: rendered.data.prompt } }];
  return { rendered, events };
}

test('trace grading needs real ordered tool results, revision and variables; assistant claims or rewrites cannot pass', () => {
  const trace = realTrace();
  assert.equal(assessTrace(trace.events, scenario, catalog).trace_structure_passed, true);
  assert.equal(assessTrace([{ type: 'item.completed', item: { type: 'agent_message', text: '已查库并渲染成功。' } }], scenario, catalog).trace_structure_passed, false);
  assert.equal(assessTrace([...trace.events].reverse(), scenario, catalog).trace_structure_passed, false);
  const rewritten = structuredClone(trace.events); rewritten[3]!.item.text = '自由改写的短提示词';
  assert.equal(assessTrace(rewritten, scenario, catalog).trace_structure_passed, false);
  const invented = structuredClone(trace.events); (invented[1]!.item.arguments as any).id = 'invented-id';
  assert.ok(assessTrace(invented, scenario, catalog).violations.some(message => message.includes('不存在')));
  const stale = structuredClone(trace.events); (stale[2]!.item.arguments as any).expected_revision = 'old';
  assert.ok(assessTrace(stale, scenario, catalog).violations.length);
  const omittedRevision = structuredClone(trace.events); delete (omittedRevision[1]!.item.arguments as any).expected_revision;
  assert.ok(assessTrace(omittedRevision, scenario, catalog).violations.length);
  const legacy = structuredClone(trace.events);
  for (const event of legacy.slice(0, 3)) (event.item.result as any).structuredContent = { result: event.item.result!.structuredContent };
  assert.equal(assessTrace(legacy, scenario, catalog).trace_structure_passed, true);
  const negative = structuredClone(trace.events);
  negative[2]!.item.result.structuredContent.data.negative_prompt = 'independent negative prompt';
  assert.equal(assessTrace(negative, scenario, catalog).trace_structure_passed, false);
  negative[3]!.item.text += '\nNegative prompt:\nindependent negative prompt';
  assert.equal(assessTrace(negative, scenario, catalog).trace_structure_passed, true);
  assert.equal(parseEvents(trace.events.map(event => JSON.stringify(event)).join('\n')).length, 4);
});

test('handoff grading rejects unsupported fields and reverse requests cannot pass by silently using templates', () => {
  const { events, rendered } = realTrace();
  const handoff = { ...scenario, kind: 'handoff-probe' as const };
  const accepted = complete('generate_image', { prompt: rendered.data.prompt }, { accepted_for_handoff_probe: true, image_generated: false }, 'image-handoff-probe');
  assert.equal(assessTrace([...events, accepted], handoff, catalog).trace_structure_passed, true);
  const wrong = complete('generate_image', { prompt: rendered.data.prompt, negative_prompt: 'unsupported' }, { accepted_for_handoff_probe: true, image_generated: false }, 'image-handoff-probe');
  assert.equal(assessTrace([...events, wrong], handoff, catalog).trace_structure_passed, false);
  assert.equal(assessTrace([accepted, ...events], handoff, catalog).trace_structure_passed, false);
  assert.equal(assessTrace([...events, { ...accepted, item: { ...accepted.item, error: 'failed', result: null } }], handoff, catalog).trace_structure_passed, false);
  assert.equal(assessTrace(events, { ...scenario, kind: 'negative' }, catalog).trace_structure_passed, false);
});

test('evaluation covers twelve implicit creative requests, six boundary requests, edge cases and three handoff groups', async () => {
  const cases = z.array(evaluationCaseSchema).parse(JSON.parse(await readFile(path.join(repositoryRoot, 'evals/plugin-cases.json'), 'utf8')));
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
  const positive = cases.filter(item => item.kind === 'positive');
  assert.equal(positive.length, 12); assert.ok(new Set(positive.map(item => item.group)).size >= 4);
  for (const item of positive) assert.ok(!/anime-prompt-atelier|动漫灵感工坊|search_prompts|get_prompt|render_prompt/i.test(item.prompt));
  assert.equal(cases.filter(item => item.kind === 'negative').length, 6);
  for (const kind of ['missing-variable', 'no-image-tool', 'no-match', 'unavailable']) assert.ok(cases.some(item => item.kind === kind));
  assert.deepEqual(cases.filter(item => item.kind === 'handoff-probe').map(item => item.group), ['character', 'scenery', 'sticker']);
  assert.deepEqual([...new Set(cases.map(item => item.project))].sort(), [0, 1]);
});

test('isolated CLI environment strips desktop tool routing while preserving permission restrictions and caller environment', () => {
  const extra = { CODEX_APP_TOOLS_PIPE_PATH: 'parent-pipe', CODEX_THREAD_ID: 'parent-chat', CODEX_PERMISSION_PROFILE: 'read-only', CODEX_SANDBOX_NETWORK_DISABLED: '1' };
  const isolated = isolatedCliEnvironment(path.join(os.tmpdir(), 'dedicated-plugin-home'), extra);
  assert.equal(isolated.CODEX_APP_TOOLS_PIPE_PATH, undefined); assert.equal(isolated.CODEX_THREAD_ID, undefined);
  assert.equal(isolated.CODEX_PERMISSION_PROFILE, 'read-only'); assert.equal(isolated.CODEX_SANDBOX_NETWORK_DISABLED, '1');
  assert.equal(extra.CODEX_APP_TOOLS_PIPE_PATH, 'parent-pipe');
});
