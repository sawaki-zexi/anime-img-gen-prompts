import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validatePlugin, pluginConfig, sha256 } from './package.ts';

export async function codexCommand(override?: string) {
  if (override) return override.endsWith('.js') ? { executable: process.execPath, prefix: [path.resolve(override)] } : { executable: path.resolve(override), prefix: [] as string[] };
  const packageEntry = path.join(path.dirname(process.execPath), 'node_modules/@openai/codex/bin/codex.js');
  try {
    await access(packageEntry);
    const targets: Record<string, string> = { 'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc', 'linux-x64': 'x86_64-unknown-linux-musl', 'linux-arm64': 'aarch64-unknown-linux-musl', 'darwin-x64': 'x86_64-apple-darwin', 'darwin-arm64': 'aarch64-apple-darwin' };
    const target = targets[`${process.platform}-${process.arch}`];
    if (target) {
      const nativePackage = createRequire(packageEntry).resolve(`@openai/codex-${process.platform}-${process.arch}/package.json`);
      const executable = path.join(path.dirname(nativePackage), 'vendor', target, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
      await access(executable); return { executable, prefix: [] as string[] };
    }
    return { executable: process.execPath, prefix: [packageEntry] };
  } catch { /* A separately installed native executable may be on PATH. */ }
  return { executable: process.platform === 'win32' ? 'codex.exe' : 'codex', prefix: [] as string[] };
}

export function isolatedCliEnvironment(home: string, extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra, CODEX_HOME: path.resolve(home) };
  // A native CLI subprocess must not route its tools through the surrounding desktop chat.
  // Preserve permission/sandbox variables; remove only parent tool routing and chat identity.
  for (const name of ['CODEX_APP_TOOLS_PIPE_PATH', 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE', 'CODEX_SESSION_ID', 'CODEX_THREAD_ID', 'CODEX_TOOL_CALL_ID', 'CODEX_TASK_WORKSPACE_VERIFYING_IDENTITY']) delete env[name];
  return env;
}

export async function runCodex(args: string[], options: { home: string; cwd: string; codex?: string; timeout?: number; input?: string; env?: NodeJS.ProcessEnv }) {
  const command = await codexCommand(options.codex);
  // The caller's environment is never mutated; authentication is never read or copied here.
  const env = isolatedCliEnvironment(options.home, options.env);
  return await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(command.executable, [...command.prefix, '--no-daemon', '--ask-for-approval', 'never', ...args], { cwd: options.cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let bytes = 0, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeout ?? 60_000);
    child.stdout.on('data', (chunk: Buffer) => { stdout.push(chunk); bytes += chunk.length; if (bytes > 20 * 1024 * 1024) child.kill(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr.push(chunk); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); timedOut ? reject(new Error('Codex 子进程超时；本次评测不算通过')) : resolve({ stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString(), code }); });
    child.stdin.end(options.input);
  });
}

export async function discoverPlugin(options: { home: string; projects: string[]; codex?: string }) {
  const command = await codexCommand(options.codex);
  const child = spawn(command.executable, [...command.prefix, '--no-daemon', '--ask-for-approval', 'never', '--sandbox', 'read-only', 'app-server'], { cwd: options.projects[0], env: isolatedCliEnvironment(options.home), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let sequence = 0, stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  const fail = (error: Error) => { for (const operation of pending.values()) { clearTimeout(operation.timer); operation.reject(error); } pending.clear(); };
  child.once('error', fail); child.once('close', () => fail(new Error('app-server 已退出')));
  lines.on('line', line => {
    let message: any; try { message = JSON.parse(line); } catch { return; }
    if (typeof message.id === 'number' && pending.has(message.id)) {
      const operation = pending.get(message.id)!; pending.delete(message.id); clearTimeout(operation.timer);
      message.error ? operation.reject(new Error(JSON.stringify(message.error))) : operation.resolve(message.result);
    }
  });
  function request(method: string, params: unknown) {
    return new Promise<any>((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`app-server ${method} 超时`)); }, 30_000);
      pending.set(id, { resolve, reject, timer }); child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
  try {
    const initialized = await request('initialize', { clientInfo: { name: 'anime-plugin-install-probe', title: 'Anime plugin install probe', version: pluginConfig.version } });
    child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
    const listed = await request('skills/list', { cwds: options.projects, forceReload: true });
    const projects = [];
    for (const project of options.projects) {
      const entry = listed.data?.find((item: any) => path.resolve(item.cwd) === path.resolve(project));
      const skill = entry?.skills?.find((item: any) => item.name === pluginConfig.skillName || item.name.endsWith(`:${pluginConfig.skillName}`));
      if (!skill || !skill.enabled || typeof skill.path !== 'string') throw new Error(`新项目未发现已启用 Skill: ${project}`);
      const installedRoot = path.join(path.resolve(options.home), 'plugins/cache');
      const relative = path.relative(installedRoot, path.resolve(skill.path));
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('发现的 Skill 不在隔离用户插件缓存内');
      await access(skill.path);
      const read = await request('fs/readFile', { path: skill.path });
      if (sha256(Buffer.from(read.dataBase64, 'base64')) !== sha256(await readFile(skill.path))) throw new Error('宿主读取 Skill 正文与缓存文件不同');
      const matter = (await import('gray-matter')).default;
      if (skill.description !== matter(Buffer.from(read.dataBase64, 'base64').toString()).data.description) throw new Error('宿主发现的 Skill 描述与包内元信息不同');
      const connection = skill.dependencies?.tools;
      if (connection?.length !== 1 || connection[0].value !== pluginConfig.serverName || connection[0].transport !== 'streamable_http') throw new Error('宿主未发现 Skill 的远程连接依赖');
      projects.push({ cwd: project, name: skill.name, description: skill.description, path: skill.path, enabled: skill.enabled, scope: skill.scope, body_read_by_host: true, body_sha256: sha256(Buffer.from(read.dataBase64, 'base64')), dependencies: skill.dependencies ?? null, interface: skill.interface ?? null, errors: entry.errors });
    }
    const mcp = await request('mcpServerStatus/list', { limit: 100, detail: 'toolsAndAuthOnly' });
    return { initialized, projects, mcp, mcp_contract_verified: mcp.data?.some((server: any) => server.name === pluginConfig.serverName && ['search_prompts', 'get_prompt', 'render_prompt'].every(tool => server.tools?.[tool])), stderr, model_calls: 0 };
  } finally {
    fail(new Error('app-server probe completed')); lines.close(); child.stdin.end(); child.kill(); await closed;
  }
}

export async function installProbe(options: { packageRoot: string; state: string; codex?: string }) {
  const packageRoot = path.resolve(options.packageRoot), state = path.resolve(options.state);
  const marketplaceRoot = path.join(packageRoot, 'marketplace');
  await validatePlugin(path.join(marketplaceRoot, 'plugins', pluginConfig.name));
  // New dedicated directories only; never install into the actual user's CODEX_HOME.
  await mkdir(state, { recursive: false });
  const home = path.join(state, 'codex-home'); await mkdir(home);
  const projects = [path.join(state, 'projects/coral-film-notes'), path.join(state, 'projects/copper-household-budget')];
  for (const project of projects) await mkdir(project, { recursive: true });
  await writeFile(path.join(projects[0]!, 'film-notes.txt'), 'A place for original short film scene notes.\n');
  await writeFile(path.join(projects[1]!, 'budget.csv'), 'category,amount\ntransport,25\nfood,60\n');
  const commands = [['--version'], ['plugin', 'marketplace', 'add', marketplaceRoot, '--json'], ['plugin', 'add', `${pluginConfig.name}@${pluginConfig.marketplace}`, '--json'], ['plugin', 'list', '--json']];
  const results = [];
  for (const args of commands) {
    const result = await runCodex(args, { home, cwd: state, codex: options.codex });
    results.push({ args, ...result });
    if (result.code !== 0) {
      await writeFile(path.join(state, 'install-report.json'), JSON.stringify({ passed: false, results }, null, 2));
      throw new Error(`隔离 CLI 安装失败: ${args.slice(0, 3).join(' ')}\n${result.stderr || result.stdout}`);
    }
  }
  const cacheRoot = path.join(home, 'plugins/cache', pluginConfig.marketplace, pluginConfig.name);
  const versions = await readdir(cacheRoot);
  const installed = [];
  for (const version of versions) installed.push(await validatePlugin(path.join(cacheRoot, version)));
  if (installed.length !== 1) throw new Error('缓存中未发现唯一有效安装');
  const config = await readFile(path.join(home, 'config.toml'), 'utf8');
  if (!config.includes(`${pluginConfig.name}@${pluginConfig.marketplace}`) || !/enabled\s*=\s*true/.test(config)) throw new Error('插件未在隔离用户配置中启用');
  const discovery = await discoverPlugin({ home, projects, codex: options.codex });
  const report = { passed: true, cli: results[0]!.stdout.trim(), packageRoot, home, projects, installed, discovery, results, model_evaluation: 'not-run', desktop_evaluation: 'not-run' };
  await writeFile(path.join(state, 'install-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
