import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { buildCatalog, canonicalJson, writeCatalog } from '../src/content/build.ts';
import { createSearchCatalog, getPrompt, renderPrompt, searchPrompts } from '../src/lib/catalog.ts';
import { catalog, prompt, fixture } from './helpers.ts';

test('the authored example builds deterministically and exactly reproduces its recorded prompt', async t => {
  const files = await fixture(); t.after(files.cleanup);
  const first = await buildCatalog(files);
  const second = await buildCatalog(files);
  assert.deepEqual(first, second);
  assert.deepEqual(first, catalog);
  assert.equal(first.prompts.length, catalog.prompts.length);
  assert.ok(new Set(first.prompts.flatMap(item => item.use_cases)).size >= 4);
  assert.ok(first.prompts.some(item => item.use_cases.includes('character')));
  assert.ok(first.prompts.some(item => item.use_cases.includes('scenery')));
  for (const item of first.prompts) {
    const rendered = renderPrompt(first, { id: item.id, expected_revision: item.prompt_revision, variables: {} });
    assert.ok(rendered.ok);
    assert.equal(rendered.data.prompt, item.examples[0]!.effective_prompt);
    assert.equal(item.examples[0]!.model, null);
    assert.deepEqual(item.model_compatibility, []);
  }
  const sticker = first.prompts.find(item => item.id === 'shiba-reaction-stickers')!;
  const metadata = await sharp(await readFile(path.join(files.publicDir, new URL(sticker.examples[0]!.image).pathname))).metadata();
  assert.equal(metadata.hasAlpha, true);
  await writeCatalog(first, files.directory);
  assert.deepEqual(JSON.parse(await readFile(path.join(files.publicDir, 'catalog.json'), 'utf8')), createSearchCatalog(first));
  assert.equal(canonicalJson({ b: 2, a: { y: 1, x: 3 } }), canonicalJson({ a: { x: 3, y: 1 }, b: 2 }));
});

test('drafts and archived records never enter public content or tools', async t => {
  const files = await fixture(); t.after(files.cleanup);
  for (const status of ['draft', 'archived']) {
    await files.edit((data) => ({ data: { ...data, id: `private-${status}`, status, title: status === 'archived' ? '已归档测试条目' : 'SECRET-UNPUBLISHED', examples: [], variables: {}, related_ids: [prompt.id] }, body: 'SECRET-UNPUBLISHED-BODY' }), `${status}.md`);
  }
  const built = await buildCatalog(files);
  assert.equal(built.prompts.length, catalog.prompts.length);
  assert.equal(built.archives.length, 1);
  assert.equal(built.archives[0]!.status, 'archived');
  assert.deepEqual(built.archives[0]!.related_ids, [prompt.id]);
  assert.ok(!JSON.stringify(built).includes('SECRET-UNPUBLISHED'));
  const search = searchPrompts(built, { query: 'SECRET-UNPUBLISHED' });
  assert.ok(search.ok); assert.deepEqual(search.data.items, []);
  for (const id of ['private-draft', 'private-archived']) {
    const detail = getPrompt(built, { id });
    assert.ok(!detail.ok); assert.equal(detail.error.code, 'NOT_FOUND');
    const render = renderPrompt(built, { id, expected_revision: prompt.prompt_revision, variables: {} });
    assert.ok(!render.ok); assert.equal(render.error.code, 'NOT_FOUND');
  }
});

test('content and image changes produce a new revision while historical generation prompts remain unchanged', async t => {
  const files = await fixture(); t.after(files.cleanup);
  await files.edit((data, body) => ({ data: { ...data, template_version: '2' }, body: `${body}\nA new authored direction.` }));
  const changedText = await buildCatalog(files);
  const changed = changedText.prompts.find(item => item.id === prompt.id)!;
  assert.notEqual(changed.prompt_revision, prompt.prompt_revision);
  assert.notEqual(changedText.catalog_revision, catalog.catalog_revision);
  assert.equal(changed.examples[0]!.effective_prompt, prompt.examples[0]!.effective_prompt);
  const imagePath = path.join(files.publicDir, 'images/summer-anime-illustrator.webp');
  const bytes = await sharp(await readFile(imagePath)).webp({ quality: 80 }).toBuffer();
  await writeFile(imagePath, bytes);
  const changedImage = await buildCatalog(files);
  assert.notEqual(changedImage.prompts.find(item => item.id === prompt.id)!.prompt_revision, changed.prompt_revision);
});

test('base-path builds use matching public image and detail URLs', async t => {
  const files = await fixture(); t.after(files.cleanup);
  const built = await buildCatalog({ ...files, siteUrl: 'https://example.com', basePath: '/anime-prompts/' });
  const entry = built.prompts.find(item => item.id === prompt.id)!;
  assert.equal(entry.url, 'https://example.com/anime-prompts/prompts/summer-anime-illustrator/');
  assert.equal(entry.examples[0]!.image, 'https://example.com/anime-prompts/images/summer-anime-illustrator.webp');
  await assert.rejects(buildCatalog({ ...files, siteUrl: 'https://example.com/nested/' }), /SITE_URL/);
});

const invalidAuthoredCases = [
  ['duplicate IDs', (data: Record<string, any>) => data, 'duplicate.md', /ID 重复/],
  ['unknown taxonomy', (data: Record<string, any>) => ({ ...data, use_cases: ['unknown'] }), undefined, /未知词表引用/],
  ['undeclared placeholder', (data: Record<string, any>) => ({ ...data, negative_template: '{missing}' }), undefined, /未声明 missing/],
  ['unused variable', (data: Record<string, any>) => ({ ...data, variables: { ...data.variables, unused: { label: 'unused', description: 'unused', required: false } } }), undefined, /未使用 unused/],
  ['invalid default', (data: Record<string, any>) => ({ ...data, variables: { subject: { ...data.variables.subject, max_length: 2 } } }), undefined, /默认值不合法/],
  ['missing source', (data: Record<string, any>) => ({ ...data, source: { ...data.source, text_license: '' } }), undefined, /text_license/],
  ['missing published example', (data: Record<string, any>) => ({ ...data, examples: [] }), undefined, /真实示例图/],
  ['missing image', (data: Record<string, any>) => ({ ...data, examples: [{ ...data.examples[0], image: 'images/missing.webp' }] }), undefined, /ENOENT/],
  ['traversing image path', (data: Record<string, any>) => ({ ...data, examples: [{ ...data.examples[0], image: '../outside.webp' }] }), undefined, /不安全的图片路径/],
  ['incorrect effective prompt', (data: Record<string, any>) => ({ ...data, examples: [{ ...data.examples[0], effective_prompt: 'Unrelated art prompt' }] }), undefined, /实际提示词/],
  ['bad related ID', (data: Record<string, any>) => ({ ...data, related_ids: ['missing-entry'] }), undefined, /关联条目/],
] as const;

for (const [label, change, filename, expected] of invalidAuthoredCases) {
  test(`build rejects ${label}`, async t => {
    const files = await fixture(); t.after(files.cleanup);
    await files.edit((data, body) => ({ data: change(data), body }), filename);
    await assert.rejects(buildCatalog(files), expected);
  });
}

test('build rejects an undecodable image', async t => {
  const files = await fixture(); t.after(files.cleanup);
  await writeFile(path.join(files.publicDir, 'images/summer-anime-illustrator.webp'), 'not an image');
  await assert.rejects(buildCatalog(files), /unsupported image format/);
});

test('a newly authored use case and alias enter the public index without a tool or UI code change', async t => {
  const files = await fixture(); t.after(files.cleanup);
  const filename = path.join(files.contentDir, 'taxonomy.json');
  const taxonomy = JSON.parse(await readFile(filename, 'utf8'));
  taxonomy.use_cases.push({ id: 'book-cover', label: '书封', aliases: ['book cover', '封面设计'] });
  await writeFile(filename, JSON.stringify(taxonomy));
  await files.edit((data, body) => ({ data: { ...data, use_cases: ['book-cover'] }, body }));
  const built = await buildCatalog(files);
  for (const source of [built, createSearchCatalog(built)]) {
    const found = searchPrompts(source, { query: '封面设计', use_cases: ['book-cover'] });
    assert.ok(found.ok); assert.deepEqual(found.data.items.map(item => item.id), [prompt.id]);
    assert.ok(found.data.facets.use_cases.some(term => term.id === 'book-cover'));
  }
});

test('archiving removes previously generated detail bodies and preserves only a stable archive notice', async t => {
  const files = await fixture(); t.after(files.cleanup);
  await writeCatalog(await buildCatalog(files), files.directory);
  await files.edit((data, body) => ({ data: { ...data, status: 'archived', related_ids: ['seaside-watercolor-station'], archive_note: '测试归档说明' }, body }));
  const built = await buildCatalog(files);
  await writeCatalog(built, files.directory);
  await assert.rejects(readFile(path.join(files.publicDir, 'data/prompts', `${prompt.id}.json`)), { code: 'ENOENT' });
  const index = await readFile(path.join(files.publicDir, 'catalog.json'), 'utf8');
  assert.ok(index.includes('测试归档说明')); assert.ok(!index.includes(prompt.template));
  assert.deepEqual(built.archives[0]!.related_ids, ['seaside-watercolor-station']);
});

test('build rejects ambiguous aliases, unknown models, invalid dimensions and archived replacement references', async t => {
  const files = await fixture(); t.after(files.cleanup);
  const taxonomyPath = path.join(files.contentDir, 'taxonomy.json');
  const taxonomy = JSON.parse(await readFile(taxonomyPath, 'utf8'));
  taxonomy.models = [{ id: 'test-model', label: '测试模型', aliases: ['MODEL ALIAS'] }, { id: 'other-model', label: '其他模型', aliases: ['model alias'] }];
  await writeFile(taxonomyPath, JSON.stringify(taxonomy));
  await assert.rejects(buildCatalog(files), /别名冲突/);
  taxonomy.models = []; await writeFile(taxonomyPath, JSON.stringify(taxonomy));
  await files.edit((data, body) => ({ data: { ...data, model_compatibility: [{ model: 'unlisted', status: 'declared', note: '测试用' }] }, body }));
  await assert.rejects(buildCatalog(files), /未知词表引用 models/);
  await files.edit((data, body) => ({ data: { ...data, model_compatibility: [], examples: [{ ...data.examples[0], width: 1 }] }, body }));
  await assert.rejects(buildCatalog(files), /图片尺寸不符/);
  await files.edit((data, body) => ({ data: { ...data, status: 'archived', related_ids: ['does-not-exist'] }, body }));
  await assert.rejects(buildCatalog(files), /关联条目/);
});
