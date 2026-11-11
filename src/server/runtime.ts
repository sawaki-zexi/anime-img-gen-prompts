import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Catalog } from '../lib/schema.ts';
import { acceptsRequest, runtimeConfig, serviceVersion, type RuntimeConfig } from './config.ts';
import { createPromptMcpServer, type ToolEvent } from './tools.ts';

export interface RequestLog extends ToolEvent {
  request_id: string;
  elapsed_ms: number;
  http_status: number;
  service_version: string;
  catalog_revision: string;
}
type Bucket = { count: number; expires: number };

export function createPromptRuntime(source: Catalog | (() => Catalog), options: {
  config?: RuntimeConfig;
  log?: (event: RequestLog) => void;
  now?: () => number;
} = {}) {
  const config = options.config ?? runtimeConfig();
  const now = options.now ?? Date.now;
  const clients = new Map<string, Bucket>();
  let global: Bucket = { count: 0, expires: 0 };
  let closed = false;
  // The SDK's legacy leg clones Request objects; a server-generated ID survives both protocol paths.
  const stats = new Map<string, ToolEvent>();
  const revisions = new Map<string, string>();
  const getCatalog = () => typeof source === 'function' ? source() : source;
  const handler = createMcpHandler(ctx => {
    const catalog = getCatalog();
    const requestId = ctx.requestInfo?.headers.get('x-atelier-request-id');
    if (requestId) revisions.set(requestId, catalog.catalog_revision);
    return createPromptMcpServer(catalog, event => { if (requestId) stats.set(requestId, event); });
  }, { maxRequestBodySize: config.maxBodyBytes, maxSubscriptions: 1, keepAliveMs: 0, onerror: () => {} });

  function rateLimit(key: string): number | null {
    const current = now();
    if (global.expires <= current) global = { count: 0, expires: current + config.windowMs };
    for (const [id, bucket] of clients) if (bucket.expires <= current) clients.delete(id);
    let bucket = clients.get(key);
    if (!bucket) {
      if (clients.size >= config.maxClients) return Math.max(1, Math.ceil(config.windowMs / 1000));
      bucket = { count: 0, expires: current + config.windowMs }; clients.set(key, bucket);
    }
    if (bucket.count >= config.requestsPerWindow || global.count >= config.globalRequestsPerWindow) return Math.max(1, Math.ceil((Math.max(bucket.count >= config.requestsPerWindow ? bucket.expires : 0, global.count >= config.globalRequestsPerWindow ? global.expires : 0) - current) / 1000));
    bucket.count++; global.count++; return null;
  }

  return {
    config,
    async fetch(request: Request, context: { clientKey?: string } = {}): Promise<Response> {
      const started = performance.now(), requestId = crypto.randomUUID();
      let revision = 'unavailable';
      let event: ToolEvent = { tool: 'protocol', result_count: 0, error_code: null };
      const json = (status: number, error: string, retryable = false, extra: Record<string, string> = {}) => {
        event.error_code = error;
        return Response.json({ error, retryable, request_id: requestId }, { status, headers: extra });
      };
      let response: Response;
      try {
        const url = new URL(request.url);
        if (!acceptsRequest(request, config)) response = json(403, 'FORBIDDEN');
        else if (request.url.length > 8192) response = json(414, 'REQUEST_URI_TOO_LONG');
        else if (closed) response = json(503, 'UNAVAILABLE', true, { 'Retry-After': '5' });
        else if (url.pathname === '/health' && request.method === 'GET') {
          event.tool = 'health';
          const catalog = getCatalog(); revision = catalog.catalog_revision;
          response = Response.json({ status: 'ok', service_version: serviceVersion, schema_version: catalog.schema_version, catalog_revision: revision, prompt_count: catalog.prompts.length, mcp_path: config.mcpPath });
        } else if (url.pathname !== config.mcpPath) response = json(404, 'NOT_FOUND');
        else {
          revision = getCatalog().catalog_revision;
          const retryAfter = rateLimit(context.clientKey ?? 'anonymous');
          if (retryAfter !== null) response = json(429, 'RATE_LIMITED', true, { 'Retry-After': String(retryAfter) });
          else {
            // The SDK enforces streaming byte limits before parsing, including chunked bodies.
            const requestHeaders = new Headers(request.headers); requestHeaders.set('x-atelier-request-id', requestId);
            response = await handler.fetch(new Request(request, { headers: requestHeaders }));
            event = stats.get(requestId) ?? event;
            revision = revisions.get(requestId) ?? revision;
            if (response.status >= 400 && !event.error_code) event.error_code = `HTTP_${response.status}`;
          }
        }
      } catch { response = json(503, 'UNAVAILABLE', true, { 'Retry-After': '5' }); }
      stats.delete(requestId); revisions.delete(requestId);
      const elapsed = performance.now() - started;
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store'); headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Request-Id', requestId); headers.set('X-Catalog-Revision', revision);
      headers.set('Server-Timing', `app;dur=${elapsed.toFixed(3)}`);
      const origin = request.headers.get('origin');
      if (origin && acceptsRequest(request, config)) headers.set('Access-Control-Allow-Origin', origin);
      try { options.log?.({ request_id: requestId, ...event, elapsed_ms: Number(elapsed.toFixed(3)), http_status: response.status, service_version: serviceVersion, catalog_revision: revision }); } catch { /* Observability cannot change a completed request. */ }
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    },
    async close() { closed = true; clients.clear(); await handler.close(); },
  };
}
