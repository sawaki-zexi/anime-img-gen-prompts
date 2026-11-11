import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { listFiles, sha256 } from '../plugin/package.ts';
import type { Catalog } from '../../src/lib/schema.ts';
import type { RuntimeConfig } from '../../src/server/config.ts';
import type { EmbeddedAsset } from '../../src/server/worker.ts';

const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.zip': 'application/zip' };

export async function bundleWorker(options: { staticDir: string; output: string; catalog: Catalog; config: RuntimeConfig }) {
  const files = await listFiles(options.staticDir);
  const assets: Record<string, EmbeddedAsset> = {};
  for (const [name, bytes] of files) {
    const key = `${options.catalog.base_path}${name.endsWith('index.html') ? name.slice(0, -10) : name}`;
    assets[key] = { content_type: mime[path.extname(name)] ?? 'application/octet-stream', base64: bytes.toString('base64'), etag: `"${sha256(bytes)}"` };
  }
  await mkdir(path.dirname(options.output), { recursive: true });
  const workerEntry = path.resolve(import.meta.dirname, '../../src/server/worker.ts').replaceAll('\\', '/');
  const result = await build({
    stdin: { contents: `import { createWorker } from ${JSON.stringify(workerEntry)};\nexport default createWorker(${JSON.stringify(options.catalog)}, ${JSON.stringify(options.config)}, ${JSON.stringify(assets)});`, resolveDir: path.resolve(import.meta.dirname, '../..'), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'browser', conditions: ['workerd', 'worker', 'browser'], tsconfigRaw: { compilerOptions: {} },
    target: 'es2022', minify: true, legalComments: 'eof', outfile: options.output, metafile: true,
  });
  if (Object.values(result.metafile.outputs).some(item => item.imports.length)) throw new Error('Worker 产物仍有外部依赖');
  await writeFile(path.join(path.dirname(options.output), 'bundle-report.json'), `${JSON.stringify({ asset_count: files.size, asset_bytes: [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0), worker_bytes: Object.values(result.metafile.outputs).reduce((sum, item) => sum + item.bytes, 0), runtime: 'Cloudflare Worker ESM', dependencies: 'bundled; no node built-ins or runtime filesystem' }, null, 2)}\n`);
  return { assets: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)])), assetCount: files.size };
}
