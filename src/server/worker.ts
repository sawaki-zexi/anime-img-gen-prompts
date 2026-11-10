import type { Catalog } from '../lib/schema.ts';
import { acceptsRequest, type RuntimeConfig } from './config.ts';
import { createPromptRuntime } from './runtime.ts';

export type EmbeddedAsset = { content_type: string; base64: string; etag: string };

/** Assets are bundled bytes: production requires no local filesystem or extra service. */
export function createWorker(catalog: Catalog, config: RuntimeConfig, assets: Record<string, EmbeddedAsset>) {
  const runtime = createPromptRuntime(catalog, { config, log: event => console.log(JSON.stringify(event)) });
  const decoded = new Map<string, Uint8Array<ArrayBuffer>>();
  return {
    async fetch(request: Request) {
      const url = new URL(request.url);
      if (!acceptsRequest(request, config) || url.pathname === '/health' || url.pathname === config.mcpPath) {
        // Cloudflare provides this header. It is used transiently and never logged or persisted.
        return runtime.fetch(request, { clientKey: request.headers.get('cf-connecting-ip') ?? 'anonymous' });
      }
      if (!['GET', 'HEAD'].includes(request.method)) return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
      let asset = assets[url.pathname];
      if (!asset && assets[`${url.pathname}/`]) return Response.redirect(new URL(`${url.pathname}/${url.search}`, request.url), 308);
      if (!asset) return Response.json({ error: 'NOT_FOUND' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      const headers = {
        'Content-Type': asset.content_type, ETag: asset.etag,
        'X-Catalog-Revision': catalog.catalog_revision, 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': url.pathname.startsWith(`${catalog.base_path}_astro/`) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
      };
      if (request.headers.get('if-none-match') === asset.etag) return new Response(null, { status: 304, headers });
      if (request.method === 'HEAD') return new Response(null, { headers });
      if (!decoded.has(url.pathname)) decoded.set(url.pathname, Uint8Array.from(atob(asset.base64), char => char.charCodeAt(0)));
      return new Response(decoded.get(url.pathname)!, { headers });
    },
  };
}
