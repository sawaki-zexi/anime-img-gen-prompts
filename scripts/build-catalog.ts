import path from 'node:path';
import { buildCatalog, writeCatalog } from '../src/content/build.ts';

const root = process.cwd();
const catalog = await buildCatalog({
  contentDir: path.join(root, 'content'), publicDir: path.join(root, 'public'),
  siteUrl: process.env.SITE_URL, basePath: process.env.SITE_BASE_PATH,
});
await writeCatalog(catalog, root);
console.log(`已构建 ${catalog.prompts.length} 条公开提示词 · ${catalog.catalog_revision}`);
