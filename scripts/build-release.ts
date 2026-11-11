import { spawn } from 'node:child_process';
import { access, copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { buildCatalog, writeCatalog } from '../src/content/build.ts';
import { validateSnapshot } from '../src/server/snapshots.ts';
import { runtimeConfig, serviceVersion } from '../src/server/config.ts';
import { deterministicZip, endpoint, listFiles, pluginConfig, repositoryRoot, sha256, validatePlugin } from './plugin/package.ts';
import { verifyRemoteContract } from './plugin/contract.ts';
import { bundleWorker } from './release/worker-bundle.ts';

const productionSchema = z.object({ project_id: z.string().min(1), origin: z.url(), mcp_path: z.string(), hosting: z.string(), account: z.string(), budget: z.string(), status: z.string() }).strict();
const releaseReportSchema = z.object({ mode: z.literal('release'), name: z.literal(pluginConfig.name), version: z.literal(pluginConfig.version), mcp_url: z.url(), gallery_url: z.url(), catalog_revision_at_build: z.string().regex(/^sha256:[a-f0-9]{64}$/), archive: z.literal(`${pluginConfig.name}-${pluginConfig.version}.zip`), archive_sha256: z.string().regex(/^[a-f0-9]{64}$/), files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).strict();

export async function buildRelease(options: { output: string; pluginDir?: string; marketplaceRef?: string; configuration?: string }) {
  const output = path.resolve(options.output);
  try { await access(output); throw new Error('发布目录已存在；请使用新的不可变版本目录'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const production = productionSchema.parse(JSON.parse(await readFile(options.configuration ?? path.join(repositoryRoot, 'release/production.json'), 'utf8')));
  endpoint(`${production.origin}/`, 'release');
  const config = runtimeConfig({ MCP_MODE: 'production', PUBLIC_ORIGIN: production.origin, MCP_PATH: production.mcp_path });
  const hosting = JSON.parse(await readFile(path.join(repositoryRoot, '.openai/hosting.json'), 'utf8'));
  if (hosting.project_id !== production.project_id || hosting.static || hosting.capabilities) throw new Error('Worker 必须保留同一个 Site 身份，且不声明 static 或平台保留 MCP capability');
  if (options.marketplaceRef && (!options.pluginDir || !/^[a-zA-Z0-9_-]+$/.test(options.marketplaceRef))) throw new Error('marketplace ref 需要已验证的发布插件且只能包含安全分支名');
  const catalog = await validateSnapshot(await buildCatalog({ contentDir: path.join(repositoryRoot, 'content'), publicDir: path.join(repositoryRoot, 'public'), siteUrl: production.origin }));
  let distribution: null | { directory: string; report: z.infer<typeof releaseReportSchema>; archive: Buffer; preflight: Awaited<ReturnType<typeof verifyRemoteContract>> } = null;
  if (options.pluginDir) {
    const directory = path.resolve(options.pluginDir);
    const report = releaseReportSchema.parse(JSON.parse(await readFile(path.join(directory, 'build-report.json'), 'utf8')));
    const pluginRoot = path.join(directory, 'marketplace/plugins', pluginConfig.name);
    const validated = await validatePlugin(pluginRoot);
    if (validated.mode !== 'release' || report.mode !== 'release' || report.mcp_url !== `${production.origin}${config.mcpPath}` || report.gallery_url !== `${production.origin}/` || report.archive !== `${pluginConfig.name}-${pluginConfig.version}.zip`) throw new Error('插件不是此生产地址和版本的 release 产物');
    const archive = await readFile(path.join(directory, report.archive));
    if (sha256(archive) !== report.archive_sha256) throw new Error('插件 ZIP 摘要不符');
    const pluginFiles = await listFiles(pluginRoot);
    if (!archive.equals(deterministicZip(pluginFiles))) throw new Error('插件 ZIP 与已验证的 marketplace 内容不同');
    const info = JSON.parse(pluginFiles.get('build-info.json')!.toString());
    // Content-only deployments reuse the immutable plugin; its historical build snapshot must match its own report.
    if (info.catalog_revision_at_build !== report.catalog_revision_at_build) throw new Error('插件元信息与自身构建报告的内容版本不同');
    if (JSON.stringify(Object.fromEntries([...pluginFiles].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([name, bytes]) => [name, sha256(bytes)]))) !== JSON.stringify(Object.fromEntries(Object.entries(report.files).sort(([a], [b]) => a.localeCompare(b, 'en'))))) throw new Error('插件文件与构建报告不同');
    const preflight = await verifyRemoteContract(report.mcp_url, report.gallery_url);
    if (preflight.catalog_revision !== catalog.catalog_revision) throw new Error('当前生产服务与候选快照不同');
    distribution = { directory, report, archive, preflight };
  }
  await mkdir(path.dirname(output), { recursive: true });
  const stage = await mkdtemp(path.join(path.dirname(output), '.anime-release-stage-'));
  try {
    const app = path.join(stage, 'build-app'); await mkdir(app);
    await cp(path.join(repositoryRoot, 'src'), path.join(app, 'src'), { recursive: true });
    await cp(path.join(repositoryRoot, 'public'), path.join(app, 'public'), { recursive: true });
    for (const filename of ['astro.config.mjs', 'tsconfig.json', 'package.json']) await copyFile(path.join(repositoryRoot, filename), path.join(app, filename));
    await symlink(path.join(repositoryRoot, 'node_modules'), path.join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await writeCatalog(catalog, app);
    let presentationFile: string | undefined;
    if (distribution) {
      presentationFile = path.join(stage, 'presentation.json');
      await writeFile(presentationFile, JSON.stringify({ catalog_revision: catalog.catalog_revision, mcp_url: distribution.report.mcp_url, download_url: `${production.origin}/downloads/${distribution.report.archive}`, archive_sha256: distribution.report.archive_sha256, plugin_version: distribution.report.version, marketplace_ref: options.marketplaceRef ?? null }));
    }
    const env = { ...process.env, SITE_URL: production.origin, SITE_BASE_PATH: '/', RELEASE_PRESENTATION_FILE: presentationFile ?? '' };
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(repositoryRoot, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', app], { cwd: app, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let logs = ''; child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`画廊构建失败 (${code})\n${logs}`)));
    });
    const staticDir = path.join(app, 'dist');
    if (distribution) { await mkdir(path.join(staticDir, 'downloads')); await writeFile(path.join(staticDir, 'downloads', distribution.report.archive), distribution.archive); }
    const files = await listFiles(staticDir);
    const manifest = {
      schema_version: 1, stage: distribution ? 'distribution' : 'service-candidate',
      service_version: serviceVersion, catalog_revision: catalog.catalog_revision, prompt_count: catalog.prompts.length,
      gallery_url: `${production.origin}/`, mcp_url: `${production.origin}${config.mcpPath}`, health_url: `${production.origin}/health`,
      project_id: production.project_id, plugin: distribution ? { version: distribution.report.version, archive: `/downloads/${distribution.report.archive}`, archive_sha256: distribution.report.archive_sha256, marketplace_ref: options.marketplaceRef ?? null, catalog_revision_at_build: distribution.report.catalog_revision_at_build } : null,
      clients: { codex_cli: 'experimental; see validation records', codex_desktop: 'not verified', chatgpt: 'not listed or verified', other_mcp: 'protocol only' },
      assets: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)])),
    };
    await writeFile(path.join(staticDir, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const dist = path.join(stage, 'dist');
    await bundleWorker({ staticDir, output: path.join(dist, 'server/index.js'), catalog, config });
    await mkdir(path.join(dist, '.openai'), { recursive: true }); await copyFile(path.join(repositoryRoot, '.openai/hosting.json'), path.join(dist, '.openai/hosting.json'));
    await mkdir(path.join(stage, 'snapshot')); await writeFile(path.join(stage, 'snapshot/catalog.json'), `${JSON.stringify(catalog)}\n`);
    await writeFile(path.join(stage, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(path.join(stage, 'build-receipt.json'), `${JSON.stringify({ catalog_revision: catalog.catalog_revision, worker_sha256: sha256(await readFile(path.join(dist, 'server/index.js'))), manifest_sha256: sha256(await readFile(path.join(stage, 'release-manifest.json'))), live_preflight: distribution?.preflight ?? 'not-run; first service candidate', deployment: 'not-run; build is not proof of publication' }, null, 2)}\n`);
    if (presentationFile) await rm(presentationFile);
    // Delete only the fresh, known staging app. Prior releases and the active deployment are untouched.
    if (path.dirname(app) !== stage) throw new Error('Unexpected staging path');
    await rm(app, { recursive: true, force: true });
    await rename(stage, output);
    return { output, dist: path.join(output, 'dist'), manifest };
  } catch (error) {
    if (path.dirname(stage) !== path.dirname(output) || !path.basename(stage).startsWith('.anime-release-stage-')) throw new Error('Unexpected release cleanup path', { cause: error });
    await rm(stage, { recursive: true, force: true }); throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { out: { type: 'string' }, 'plugin-dir': { type: 'string' }, 'marketplace-ref': { type: 'string' }, config: { type: 'string' } } });
  if (!values.out) throw new Error('用法: npm run release:build -- --out <新的不可变产物目录> [--plugin-dir <已通过生产preflight的release产物>] [--marketplace-ref <实际已发布ref>]');
  console.log(JSON.stringify(await buildRelease({ output: values.out, pluginDir: values['plugin-dir'], marketplaceRef: values['marketplace-ref'], configuration: values.config }), null, 2));
}
