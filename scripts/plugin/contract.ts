import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { getResultSchema, renderResultSchema, searchResultSchema } from '../../src/lib/schema.ts';

/** Read-only live preflight. It never sends credentials or starts a local runtime. */
export async function verifyRemoteContract(mcpUrl: string, galleryUrl: string) {
  const client = new Client({ name: 'anime-plugin-release-check', version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } });
  const resources = new AsyncDisposableStack(); resources.defer(() => client.close());
  const signal = AbortSignal.timeout(15_000);
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), { requestInit: { signal, credentials: 'omit' }, reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 100, maxReconnectionDelay: 100, reconnectionDelayGrowFactor: 1 } });
  try {
    await client.connect(transport);
    const listing = await client.listTools();
    for (const name of ['search_prompts', 'get_prompt', 'render_prompt']) {
      const tool = listing.tools.find(tool => tool.name === name);
      if (!tool?.inputSchema || !tool.outputSchema || tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint !== false) throw new Error(`远程服务缺少有效只读工具契约: ${name}`);
    }
    async function call(name: string, args: Record<string, unknown>) {
      const response = await client.callTool({ name, arguments: args });
      const structured = response.structuredContent as { result?: unknown } | undefined;
      const text = response.content.find(item => item.type === 'text');
      const value = structured?.result ?? structured ?? (text?.type === 'text' ? JSON.parse(text.text) : undefined);
      if (response.isError) throw new Error(`远程服务 ${name} 失败: ${JSON.stringify(value)}`);
      return value;
    }
    const search = searchResultSchema.parse(await call('search_prompts', { query: '', limit: 1 }));
    if (!search.ok || !search.data.items.length) throw new Error('远程服务没有可读取的公开模板');
    const candidate = search.data.items[0]!;
    const detail = getResultSchema.parse(await call('get_prompt', { id: candidate.id, expected_revision: candidate.prompt_revision }));
    if (!detail.ok || detail.data.id !== candidate.id || detail.catalog_revision !== search.catalog_revision) throw new Error('远程详情与搜索快照不一致');
    const variables = Object.fromEntries(Object.entries(detail.data.variables).map(([name, declaration]) => [name, declaration.default ?? declaration.options?.[0] ?? (declaration.max_length >= 4 ? 'test' : 'x')]));
    const rendered = renderResultSchema.parse(await call('render_prompt', { id: detail.data.id, expected_revision: detail.data.prompt_revision, variables }));
    if (!rendered.ok || rendered.catalog_revision !== search.catalog_revision || rendered.data.prompt_revision !== detail.data.prompt_revision) throw new Error('远程渲染与详情快照不一致');
    const gallery = await fetch(galleryUrl, { signal, redirect: 'error' });
    if (!gallery.ok) throw new Error(`画廊不可用: HTTP ${gallery.status}`);
    const html = await gallery.text();
    const galleryRevision = html.match(/<meta\b[^>]*name=["']catalog-revision["'][^>]*content=["']([^"']+)["']/i)?.[1];
    if (galleryRevision !== search.catalog_revision) throw new Error('画廊与 MCP 内容版本不同或缺少可验证版本');
    const healthResponse = await fetch(new URL('/health', mcpUrl), { signal, credentials: 'omit', redirect: 'error' });
    if (!healthResponse.ok) throw new Error(`健康检查不可用: HTTP ${healthResponse.status}`);
    const health = await healthResponse.json() as { catalog_revision?: string; status?: string };
    if (health.status !== 'ok' || health.catalog_revision !== search.catalog_revision) throw new Error('健康检查与 MCP 内容版本不同');
    return { catalog_revision: search.catalog_revision, real_id: candidate.id, prompt_revision: detail.data.prompt_revision, tools: listing.tools.map(tool => tool.name).sort(), gallery_status: gallery.status, health_status: healthResponse.status, authentication: 'anonymous; no cookies or credentials sent' };
  } finally { await resources.disposeAsync(); }
}
