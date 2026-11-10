import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';

export const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const slug = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const configSchema = z.object({
  name: slug, version: z.string().regex(/^\d+\.\d+\.\d+$/), marketplace: slug,
  displayName: z.string().min(1), description: z.string().min(1),
  shortDescription: z.string().min(25).max(64), developerName: z.string().min(1),
  repository: z.url(), serverName: slug, skillName: slug,
}).strict();
export const pluginConfig = configSchema.parse(JSON.parse(await readFile(path.join(repositoryRoot, 'plugin/config.json'), 'utf8')));
export const pluginSchemaUrl = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
export const mcpSchemaUrl = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
export type BuildMode = 'release' | 'evaluation';

export function endpoint(value: string, mode: BuildMode): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('服务与画廊地址必须是完整 URL'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('地址不能包含凭据、查询或片段');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const loopback = host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
  if (mode === 'evaluation' && loopback && ['http:', 'https:'].includes(url.protocol)) return url.href;
  const privateOrReservedIp = /^(?:0\.|10\.|127\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|192\.0\.(?:0|2)\.|198\.(?:1[89]|51\.100)\.|203\.0\.113\.|(?:22[4-9]|2[3-5]\d)\.)/.test(host);
  if (url.protocol !== 'https:' || loopback || !host.includes('.') || privateOrReservedIp || url.port === '0' || ['0.0.0.0', '::'].includes(host)) throw new Error('发布包必须使用公开 HTTPS 地址；回环地址仅允许显式 evaluation 配置');
  if (/(?:^|\.)(?:example\.(?:com|org|net)|invalid|test|local|internal|localhost|localdomain|lan|home|arpa)$/.test(host) || host === 'example' || host.endsWith('.example')) throw new Error('发布包不能使用示例或保留域名');
  return url.href;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
export const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function skillDescription(sourceDescription: unknown, galleryUrl: string): string {
  const description = z.string().min(1).parse(sourceDescription).trim();
  return z.string().max(1024).parse(`${description} 服务不可用时说明原因并给出画廊入口 ${galleryUrl}；普通创作回退不得冒充库内模板。`);
}

/** A small ZIP store writer: sorted UTF-8 paths, fixed 1980 timestamp, no platform metadata. */
export function deterministicZip(files: Map<string, Buffer>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [filename, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const name = Buffer.from(filename);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0x21, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, bytes);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(0x21, 14); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(bytes.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, name); offset += header.length + name.length + bytes.length;
  }
  const directoryBytes = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(directoryBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directoryBytes, end]);
}

export async function listFiles(root: string, prefix = ''): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const item of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) throw new Error(`包不能包含符号链接: ${relative}`);
    if (item.isDirectory()) for (const [name, bytes] of await listFiles(root, relative)) files.set(name, bytes);
    else if (item.isFile()) files.set(relative, await readFile(path.join(root, relative)));
    else throw new Error(`包不能包含特殊文件: ${relative}`);
  }
  return files;
}

export async function buildPlugin(options: { output: string; mcpUrl: string; galleryUrl: string; mode: BuildMode }) {
  const { output, mode } = options;
  if (!['release', 'evaluation'].includes(mode)) throw new Error('未知构建模式');
  const mcpUrl = endpoint(options.mcpUrl, mode), galleryUrl = endpoint(options.galleryUrl, mode);
  const config = pluginConfig;
  const presentation = {
    displayName: config.displayName, shortDescription: config.shortDescription,
    longDescription: config.description, developerName: config.developerName, category: 'Design',
    capabilities: ['Read'], websiteURL: galleryUrl, brandColor: '#778AF8',
    composerIcon: './assets/icon.svg', logo: './assets/icon.svg',
    defaultPrompt: ['画一张水彩动漫头像，主角是戴圆眼镜的成年旅行者。'],
  };
  const identity = { name: config.name, version: config.version, description: config.description, author: { name: config.developerName }, homepage: galleryUrl, repository: config.repository };
  const files = new Map<string, Buffer>();
  const add = (name: string, value: string | Buffer) => files.set(name, Buffer.isBuffer(value) ? value : Buffer.from(value));
  add('plugin.json', json({ $schema: pluginSchemaUrl, ...identity, extensions: { 'com.openai': { interface: presentation } } }));
  // Schema 1.0.0 forbids server extensions. Omitting auth headers makes this an anonymous connection.
  add('mcp.json', json({ $schema: mcpSchemaUrl, mcpServers: { [config.serverName]: { type: 'streamable-http', url: mcpUrl } } }));
  add('.codex-plugin/plugin.json', json({ ...identity, skills: './skills/', mcpServers: './.mcp.json', interface: presentation }));
  add('.mcp.json', json({ mcpServers: { [config.serverName]: { type: 'http', url: mcpUrl } } }));
  add('assets/icon.svg', (await readFile(path.join(repositoryRoot, 'public/favicon.svg'), 'utf8')).replaceAll('\r\n', '\n'));
  const sourceSkill = await readFile(path.join(repositoryRoot, 'plugin/skills', config.skillName, 'SKILL.md'), 'utf8');
  const sourceDocument = matter(sourceSkill.replaceAll('\r\n', '\n'));
  if (sourceDocument.data.name !== config.skillName) throw new Error('源 Skill 身份与插件配置不同');
  add(`skills/${config.skillName}/SKILL.md`, matter.stringify(`${sourceDocument.content.trim()}\n\n画廊入口：${galleryUrl}\n`, { ...sourceDocument.data, description: skillDescription(sourceDocument.data.description, galleryUrl) }));
  add(`skills/${config.skillName}/agents/openai.yaml`, `interface:\n  display_name: ${JSON.stringify(config.displayName)}\n  short_description: ${JSON.stringify(config.shortDescription)}\n  default_prompt: ${JSON.stringify(`Use $${config.skillName} to find and fill an anime image prompt.`)}\ndependencies:\n  tools:\n    - type: "mcp"\n      value: ${JSON.stringify(config.serverName)}\n      description: "Search, read and render real anime prompt templates"\n      transport: "streamable_http"\n      url: ${JSON.stringify(mcpUrl)}\npolicy:\n  allow_implicit_invocation: true\n`);
  add('build-info.json', json({ schema_version: 1, mode, plugin: config.name, plugin_version: config.version, mcp_url: mcpUrl, gallery_url: galleryUrl, authentication: 'none', content: 'remote-current-snapshot', source_revision: `sha256:${sha256(json([...files].map(([name, bytes]) => [name, sha256(bytes)])))}` }));
  const archive = deterministicZip(files);
  // Refuse to replace any existing output, including user files or symlinks.
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await mkdir(path.resolve(output), { recursive: false });
  const marketplaceRoot = path.join(path.resolve(output), 'marketplace');
  const pluginRoot = path.join(marketplaceRoot, 'plugins', config.name);
  for (const [filename, bytes] of files) {
    const target = path.join(pluginRoot, filename);
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' });
  }
  const marketplace = { name: config.marketplace, interface: { displayName: config.displayName }, plugins: [{ name: config.name, source: { source: 'local', path: `./plugins/${config.name}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Design' }] };
  await mkdir(path.join(marketplaceRoot, '.agents/plugins'), { recursive: true });
  await writeFile(path.join(marketplaceRoot, '.agents/plugins/marketplace.json'), json(marketplace));
  const archiveName = `${config.name}-${config.version}${mode === 'evaluation' ? '-evaluation' : ''}.zip`;
  await writeFile(path.join(output, archiveName), archive);
  const report = { mode, name: config.name, version: config.version, mcp_url: mcpUrl, gallery_url: galleryUrl, archive: archiveName, archive_sha256: sha256(archive), files: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)])) };
  await writeFile(path.join(output, 'build-report.json'), json(report));
  return { output: path.resolve(output), marketplaceRoot, pluginRoot, archiveName, report };
}

export async function validatePlugin(pluginRoot: string) {
  if (!(await lstat(pluginRoot)).isDirectory()) throw new Error('插件根目录不存在');
  const files = await listFiles(pluginRoot);
  const parse = (name: string) => { const value = files.get(name); if (!value) throw new Error(`缺少 ${name}`); return JSON.parse(value.toString()); };
  const info = parse('build-info.json'), portable = parse('plugin.json'), mcp = parse('mcp.json'), compatibility = parse('.codex-plugin/plugin.json'), legacyMcp = parse('.mcp.json');
  const { AjvJsonSchemaValidator } = await import('@modelcontextprotocol/client/validators/ajv');
  const validator = new AjvJsonSchemaValidator();
  for (const [name, document] of [['plugin', portable], ['mcp', mcp]] as const) {
    const schema = JSON.parse(await readFile(path.join(repositoryRoot, `plugin/schemas/${name}.schema.json`), 'utf8'));
    const result = validator.getValidator(schema)(document);
    if (!result.valid) throw new Error(`${name}.json 不符合官方 Schema: ${result.errorMessage}`);
  }
  const { mode, mcp_url: mcpUrl, gallery_url: galleryUrl } = z.object({ schema_version: z.literal(1), mode: z.enum(['release', 'evaluation']), plugin: z.literal(pluginConfig.name), plugin_version: z.literal(pluginConfig.version), mcp_url: z.string(), gallery_url: z.string(), authentication: z.literal('none'), content: z.literal('remote-current-snapshot'), source_revision: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict().parse(info);
  endpoint(mcpUrl, mode); endpoint(galleryUrl, mode);
  if (portable.name !== pluginConfig.name || portable.version !== pluginConfig.version || portable.$schema !== pluginSchemaUrl || compatibility.name !== portable.name || compatibility.version !== portable.version) throw new Error('插件身份或版本漂移');
  if (JSON.stringify(portable.extensions['com.openai'].interface) !== JSON.stringify(compatibility.interface)) throw new Error('展示信息漂移');
  if (portable.homepage !== galleryUrl || compatibility.homepage !== galleryUrl || portable.extensions['com.openai'].interface.websiteURL !== galleryUrl || compatibility.skills !== './skills/' || compatibility.mcpServers !== './.mcp.json') throw new Error('画廊地址或兼容组件引用漂移');
  const expectedPortable = { $schema: mcpSchemaUrl, mcpServers: { [pluginConfig.serverName]: { type: 'streamable-http', url: mcpUrl } } };
  const expectedLegacy = { mcpServers: { [pluginConfig.serverName]: { type: 'http', url: mcpUrl } } };
  if (JSON.stringify(mcp) !== JSON.stringify(expectedPortable) || JSON.stringify(legacyMcp) !== JSON.stringify(expectedLegacy)) throw new Error('服务地址、传输或匿名连接配置漂移');
  const yaml = files.get(`skills/${pluginConfig.skillName}/agents/openai.yaml`);
  if (!yaml) throw new Error('缺少 Skill 连接声明');
  const agent = matter(`---\n${yaml}\n---\n`).data;
  const dependency = agent.dependencies?.tools;
  if (dependency?.length !== 1 || dependency[0].url !== mcpUrl || dependency[0].value !== pluginConfig.serverName || dependency[0].type !== 'mcp' || dependency[0].transport !== 'streamable_http' || agent.policy?.allow_implicit_invocation !== true) throw new Error('Skill 依赖连接或隐式发现声明漂移');
  const skill = files.get(`skills/${pluginConfig.skillName}/SKILL.md`);
  if (!skill) throw new Error('缺少 Skill 正文');
  const skillDocument = matter(skill.toString());
  const sourceSkill = matter(await readFile(path.join(repositoryRoot, 'plugin/skills', pluginConfig.skillName, 'SKILL.md'), 'utf8'));
  const galleryLines = skillDocument.content.split(/\r?\n/).filter(line => line.startsWith('画廊入口：'));
  if (skillDocument.data.name !== pluginConfig.skillName || skillDocument.data.description !== skillDescription(sourceSkill.data.description, galleryUrl) || galleryLines.length !== 1 || galleryLines[0] !== `画廊入口：${galleryUrl}`) throw new Error('Skill 身份、描述回退入口或正文画廊地址与配置不一致');
  for (const [name, bytes] of files) {
    if (!/^(?:plugin\.json|mcp\.json|build-info\.json|\.mcp\.json|\.codex-plugin\/plugin\.json|assets\/icon\.svg|skills\/anime-prompt-atelier\/(?:SKILL\.md|agents\/openai\.yaml))$/.test(name)) throw new Error(`包内包含未审核文件: ${name}`);
    if (name.endsWith('.json') && /(?:"command"|"env"|"headers"|"hooks"|"apps")\s*:/.test(bytes.toString())) throw new Error('远程插件不应携带本地进程、密钥或 hooks');
  }
  for (const reference of [compatibility.skills, compatibility.mcpServers, compatibility.interface.composerIcon, compatibility.interface.logo]) {
    if (typeof reference !== 'string' || !reference.startsWith('./') || reference.includes('..')) throw new Error('引用必须限定在插件根目录');
    await lstat(path.join(pluginRoot, reference));
  }
  const ordered = ['plugin.json', 'mcp.json', '.codex-plugin/plugin.json', '.mcp.json', 'assets/icon.svg', `skills/${pluginConfig.skillName}/SKILL.md`, `skills/${pluginConfig.skillName}/agents/openai.yaml`];
  const revision = `sha256:${sha256(json(ordered.map(name => [name, sha256(files.get(name)!)])))}`;
  if (info.source_revision !== revision) throw new Error('包内文件与生成时的内容哈希不同');
  return { name: portable.name, version: portable.version, mode, mcpUrl, galleryUrl, fileCount: files.size };
}
