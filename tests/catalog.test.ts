import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { buildCatalog, canonicalJson, writeCatalog } from '../src/content/build.ts';
import { getPrompt, renderPrompt, searchPrompts } from '../src/lib/catalog.ts';
import { catalog, prompt, fixture } from './helpers.ts';

test('the authored example builds deterministically and exactly reproduces its recorded prompt', async t => {
  const files = await fixture(); t.after(files.cleanup);
  const first = await buildCatalog(files);
  const second = await buildCatalog(files);
  assert.deepEqual(first, second);
  assert.deepEqual(first, catalog);
  assert.equal(first.prompts.length, 1);
  const rendered = renderPrompt(first, { id: prompt.id, expected_revision: prompt.prompt_revision, variables: {} });
  assert.equal(rendered.ok, true);
  if (!rendered.ok) return;
  assert.equal(rendered.data.prompt, prompt.examples[0]!.effective_prompt);
  assert.equal(prompt.examples[0]!.model, null);
  assert.deepEqual(prompt.examples[0]!.parameters, {});
  assert.deepEqual(prompt.model_compatibility, []);
  await writeCatalog(first, files.directory);
  assert.equal(await readFile(path.join(files.directory, 'generated/catalog.json'), 'utf8'), await readFile(path.join(files.publicDir, 'catalog.json'), 'utf8'));
  assert.equal(canonicalJson({ b: 2, a: { y: 1, x: 3 } }), canonicalJson({ a: { x: 3, y: 1 }, b: 2 }));
});

test('drafts and archived records never enter public content or tools', async t => {
  const files = await fixture(); t.after(files.cleanup);
  for (const status of ['draft', 'archived']) {
    await files.edit((data, body) => ({ data: { ...data, id: `private-${status}`, status, title: 'SECRET-UNPUBLISHED', examples: [] }, body }), `${status}.md`);
  }
  const built = await buildCatalog(files);
  assert.equal(built.prompts.length, 1);
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
  assert.notEqual(changedText.prompts[0]!.prompt_revision, prompt.prompt_revision);
  assert.notEqual(changedText.catalog_revision, catalog.catalog_revision);
  assert.equal(changedText.prompts[0]!.examples[0]!.effective_prompt, prompt.examples[0]!.effective_prompt);
  const imagePath = path.join(files.publicDir, 'images/summer-anime-illustrator.webp');
  const bytes = await sharp(await readFile(imagePath)).webp({ quality: 80 }).toBuffer();
  await writeFile(imagePath, bytes);
  const changedImage = await buildCatalog(files);
  assert.notEqual(changedImage.prompts[0]!.prompt_revision, changedText.prompts[0]!.prompt_revision);
});

test('base-path builds use matching public image and detail URLs', async t => {
  const files = await fixture(); t.after(files.cleanup);
  const built = await buildCatalog({ ...files, siteUrl: 'https://example.com', basePath: '/anime-prompts/' });
  assert.equal(built.prompts[0]!.url, 'https://example.com/anime-prompts/prompts/summer-anime-illustrator/');
  assert.equal(built.prompts[0]!.examples[0]!.image, 'https://example.com/anime-prompts/images/summer-anime-illustrator.webp');
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
