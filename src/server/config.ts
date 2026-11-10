export const serviceVersion = '0.1.0';

export interface RuntimeConfig {
  mode: 'local' | 'production';
  publicOrigin?: string;
  mcpPath: string;
  maxBodyBytes: number;
  requestsPerWindow: number;
  globalRequestsPerWindow: number;
  windowMs: number;
  maxClients: number;
}

function integer(value: string | undefined, fallback: number, name: string, max = 1_000_000) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) throw new Error(`${name} 必须是 1 至 ${max} 的整数`);
  return Number(value);
}

/** Invalid production configuration stops startup; it never falls back to localhost. */
export function runtimeConfig(env: Record<string, string | undefined> = {}): RuntimeConfig {
  const mode = env.MCP_MODE ?? 'local';
  if (mode !== 'local' && mode !== 'production') throw new Error('MCP_MODE 必须是 local 或 production');
  let publicOrigin: string | undefined;
  if (mode === 'production') {
    const url = new URL(env.PUBLIC_ORIGIN ?? '');
    if (url.protocol !== 'https:' || url.origin !== env.PUBLIC_ORIGIN || url.username || url.password) throw new Error('PUBLIC_ORIGIN 必须是无末尾斜线的 HTTPS 来源');
    publicOrigin = url.origin;
  }
  const mcpPath = env.MCP_PATH ?? (mode === 'production' ? '/api/mcp' : '/mcp');
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(mcpPath) || ['/health', '/release.json'].includes(mcpPath)) throw new Error('MCP_PATH 必须是独立的绝对路径');
  return {
    mode, publicOrigin, mcpPath,
    maxBodyBytes: integer(env.MCP_MAX_BODY_BYTES, 128 * 1024, 'MCP_MAX_BODY_BYTES', 1024 * 1024),
    requestsPerWindow: integer(env.MCP_RATE_LIMIT, 120, 'MCP_RATE_LIMIT'),
    globalRequestsPerWindow: integer(env.MCP_GLOBAL_RATE_LIMIT, 2400, 'MCP_GLOBAL_RATE_LIMIT'),
    windowMs: integer(env.MCP_RATE_WINDOW_MS, 60_000, 'MCP_RATE_WINDOW_MS', 3_600_000),
    maxClients: integer(env.MCP_MAX_CLIENTS, 4096, 'MCP_MAX_CLIENTS', 65536),
  };
}

export function acceptsRequest(request: Request, config: RuntimeConfig) {
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? url.host;
  const origin = request.headers.get('origin');
  if (config.mode === 'production') return host === new URL(config.publicOrigin!).host && (!origin || origin === config.publicOrigin);
  const local = (value: string) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${value}`).hostname);
  try { return local(host) && (!origin || (['http:', 'https:'].includes(new URL(origin).protocol) && local(new URL(origin).host))); }
  catch { return false; }
}
