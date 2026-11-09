import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import sharp from 'sharp';
import { authoredPromptSchema, catalogSchema, taxonomySchema, type Catalog, type Prompt } from '../lib/schema.ts';
import { placeholderPattern, renderPrompt } from '../lib/catalog.ts';

export interface BuildOptions {
  contentDir: string;
  publicDir: string;
  siteUrl?: string;
  basePath?: string;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const hash = (value: string | Buffer) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const filename = path.join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(filename) : Promise.resolve(entry.isFile() && entry.name.endsWith('.md') ? [filename] : []);
  }));
  return nested.flat().sort();
}

export async function buildCatalog(options: BuildOptions): Promise<Catalog> {
  const site = new URL(options.siteUrl ?? 'http://localhost:5173');
  if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password || site.pathname !== '/' || site.search || site.hash) {
    throw new Error('SITE_URL 必须是无路径、无凭据的 HTTP(S) 站点来源');
  }
  const basePath = `/${(options.basePath ?? '/').split('/').filter(Boolean).join('/')}${options.basePath && options.basePath !== '/' ? '/' : ''}`;
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(basePath)) throw new Error('SITE_BASE_PATH 必须是由安全路径段组成的路径');
  const publicRoot = await realpath(options.publicDir);
  const taxonomy = taxonomySchema.parse(JSON.parse(await readFile(path.join(options.contentDir, 'taxonomy.json'), 'utf8')));
  for (const terms of Object.values(taxonomy)) {
    if (new Set(terms.map(term => term.id)).size !== terms.length) throw new Error('词表 ID 重复');
  }
  const files = await markdownFiles(path.join(options.contentDir, 'prompts'));
  const records: Prompt[] = [];
  const allIds = new Set<string>();
  for (const filename of files) {
    try {
      const document = matter(await readFile(filename, 'utf8'));
      const authored = authoredPromptSchema.parse(document.data);
      if (allIds.has(authored.id)) throw new Error(`ID 重复: ${authored.id}`);
      allIds.add(authored.id);
      const template = document.content.trim();
      if (!template) throw new Error('提示词正文不能为空');
      const placeholders = new Set([...`${template}\n${authored.negative_template ?? ''}`.matchAll(placeholderPattern)].map(match => match[1]!));
      const declared = Object.keys(authored.variables);
      const undeclared = [...placeholders].filter(name => !Object.hasOwn(authored.variables, name));
      const unused = declared.filter(name => !placeholders.has(name));
      if (undeclared.length || unused.length) throw new Error(`模板变量声明不一致: 未声明 ${undeclared.join(', ')}; 未使用 ${unused.join(', ')}`);
      for (const [name, variable] of Object.entries(authored.variables)) {
        if (variable.default !== undefined && ((variable.required && !variable.default.trim()) || [...variable.default].length > variable.max_length || (variable.options && !variable.options.includes(variable.default)))) {
          throw new Error(`变量 ${name} 的默认值不合法`);
        }
      }
      for (const field of ['use_cases', 'styles'] as const) {
        for (const id of authored[field]) if (!taxonomy[field].some(term => term.id === id)) throw new Error(`未知词表引用 ${field}: ${id}`);
      }
      // Drafts are validated as authored data, but their body and images never enter the public snapshot.
      if (authored.status !== 'published') continue;
      if (!authored.examples.length) throw new Error('已发布条目必须有真实示例图');
      if (new Set(authored.examples.map(example => example.id)).size !== authored.examples.length) throw new Error('示例 ID 重复');
      const assets: Record<string, string> = {};
      const examples = [];
      for (const example of authored.examples) {
        const resolved = { ...example };
        for (const field of ['image', 'thumbnail'] as const) {
          const relative = example[field];
          if (!/^[a-zA-Z0-9][a-zA-Z0-9/_\-.]*$/.test(relative) || relative.split('/').some(segment => segment === '..' || segment === '.')) throw new Error(`不安全的图片路径: ${relative}`);
          const absolute = await realpath(path.join(publicRoot, relative));
          const fromRoot = path.relative(publicRoot, absolute);
          if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) throw new Error(`图片必须位于 public 内: ${relative}`);
          const bytes = await readFile(absolute);
          const metadata = await sharp(bytes).metadata();
          if (!metadata.width || !metadata.height) throw new Error(`图片无法解码: ${relative}`);
          // Force a pixel decode as well: metadata alone accepts some truncated files.
          await sharp(bytes).resize(1, 1).raw().toBuffer();
          if (field === 'image' && (metadata.width !== example.width || metadata.height !== example.height)) throw new Error(`图片尺寸不符: ${relative}`);
          assets[relative] = hash(bytes);
          resolved[field] = new URL(`${basePath}${relative}`, site.origin).href;
        }
        examples.push(resolved);
      }
      const body = { ...authored, template, examples, url: new URL(`${basePath}prompts/${authored.id}/`, site.origin).href };
      const prompt_revision = hash(canonicalJson({ body, assets }));
      const prompt: Prompt = { ...body, prompt_revision };
      // A recorded example using the current template version must reproduce its actual prompt.
      // Older versions retain their historical prompt independently of subsequent template edits.
      for (const example of examples.filter(item => item.template_version === authored.template_version)) {
        const snapshot = { schema_version: '1' as const, catalog_revision: prompt_revision, site_url: site.origin, base_path: basePath, taxonomy, prompts: [prompt] };
        const rendered = renderPrompt(snapshot, { id: prompt.id, expected_revision: prompt_revision, variables: example.variables });
        if (!rendered.ok || rendered.data.prompt !== example.effective_prompt) throw new Error(`示例 ${example.id} 的实际提示词与对应模板/变量不符`);
      }
      records.push(prompt);
    } catch (error) {
      throw new Error(`${path.relative(options.contentDir, filename)}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  for (const prompt of records) {
    for (const id of prompt.related_ids) if (!records.some(item => item.id === id)) throw new Error(`${prompt.id}: 关联条目未公开或不存在: ${id}`);
  }
  const payload = { schema_version: '1' as const, site_url: site.origin, base_path: basePath, taxonomy, prompts: records.sort((a, b) => a.id.localeCompare(b.id, 'en')) };
  return catalogSchema.parse({ ...payload, catalog_revision: hash(canonicalJson(payload)) });
}

export async function writeCatalog(catalog: Catalog, projectRoot: string) {
  const json = `${JSON.stringify(catalog, null, 2)}\n`;
  await mkdir(path.join(projectRoot, 'generated'), { recursive: true });
  await writeFile(path.join(projectRoot, 'generated/catalog.json'), json, 'utf8');
  await writeFile(path.join(projectRoot, 'public/catalog.json'), json, 'utf8');
}
