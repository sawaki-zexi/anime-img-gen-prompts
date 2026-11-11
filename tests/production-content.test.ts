import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { getPrompt, renderPrompt, searchPrompts } from '../src/lib/catalog.ts';
import { exampleSchema } from '../src/lib/schema.ts';
import { productionCatalog as catalog, projectRoot } from './helpers.ts';

export const removedIds = ['summer-anime-illustrator', 'mint-watercolor-avatar', 'stargazer-character-sheet', 'seaside-watercolor-station', 'sleepy-cat-four-panel', 'shiba-reaction-stickers', 'windchime-librarian-avatar'];
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

test('four supplied originals preserve text and pixels, declare GPT reference generation without invented versions or dates, and keep retired content absent', async () => {
  const proof = JSON.parse(await readFile(path.join(projectRoot, 'docs/validation/evidence/content-replacement-hashes.json'), 'utf8'));
  const catgirlProof = JSON.parse(await readFile(path.join(projectRoot, 'docs/validation/evidence/chibi-catgirl-sticker-hashes.json'), 'utf8'));
  const entries = [...proof.entries, ...catgirlProof.entries];
  assert.deepEqual(catalog.prompts.map(prompt => prompt.id).sort(), ['chibi-catgirl-sticker', 'cotton-doll-20cm-character-redraw', 'rough-crayon-character-redraw', 'vacant-chibi-avatar-redraw'].sort());
  assert.deepEqual(catalog.archives, []);
  const expectedFiles: string[] = [];
  for (const prompt of catalog.prompts) {
    const expected = entries.find((entry: any) => entry.id === prompt.id); assert.ok(expected);
    assert.equal(hash(prompt.template), expected.prompt_sha256);
    assert.deepEqual(prompt.variables, {}); assert.equal(prompt.negative_template, undefined);
    const rendered = renderPrompt(catalog, { id: prompt.id, expected_revision: prompt.prompt_revision, variables: {} }); assert.ok(rendered.ok); assert.equal(rendered.data.prompt, prompt.template);
    assert.ok(prompt.summary.includes('原角色参考图')); assert.ok(prompt.conditions.some(condition => condition.includes('不自动作为用户角色参考')));
    const example = prompt.examples[0]!;
    assert.equal(example.width, expected.width); assert.equal(example.height, expected.height);
    assert.equal(example.effective_prompt, prompt.template); assert.equal(example.created_at, null); assert.equal(example.generator, 'GPT'); assert.equal(example.model, null); assert.deepEqual(example.parameters, {});
    assert.ok(example.provenance.includes('用户提供配图')); assert.ok(example.provenance.includes('GPT 使用参考图生成')); assert.ok(example.provenance.includes('未独立复验生成条件'));
    assert.deepEqual(prompt.input_modes, ['reference-image']); assert.equal(prompt.tag_template, undefined); assert.equal(prompt.customization, undefined);
    assert.equal(prompt.model_compatibility.length, 1); assert.equal(prompt.model_compatibility[0]!.model, 'gpt'); assert.equal(prompt.model_compatibility[0]!.status, 'declared'); assert.ok(prompt.model_compatibility[0]!.note.includes('具体模型版本未知'));
    const detail = getPrompt(catalog, { id: prompt.id, include_examples: true }); assert.ok(detail.ok);
    assert.equal(detail.data.source.author, '用户提供'); assert.ok(detail.data.source.text_license.includes('用户未声明许可')); assert.ok(detail.data.source.image_license.includes('用户未声明许可')); assert.deepEqual(detail.data.conditions, prompt.conditions);
    assert.deepEqual(detail.data.capabilities.formats, [prompt.id === 'chibi-catgirl-sticker' ? 'tags' : 'text']);
    for (const field of ['image', 'thumbnail'] as const) {
      const filename = path.basename(new URL(example[field]).pathname); expectedFiles.push(filename);
      const bytes = await readFile(path.join(projectRoot, 'public/images', filename));
      assert.equal(hash(bytes), field === 'image' ? expected.image_webp_sha256 : expected.thumbnail_sha256);
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.width, field === 'image' ? expected.width : expected.thumbnail_width); assert.equal(metadata.height, field === 'image' ? expected.height : expected.thumbnail_height);
      if (field === 'thumbnail') {
        const scale = 480 / Math.max(expected.width, expected.height);
        assert.equal(metadata.width, Math.round(expected.width * scale)); assert.equal(metadata.height, Math.round(expected.height * scale));
      }
      if (field === 'image') assert.equal(hash(await sharp(bytes).ensureAlpha().raw().toBuffer()), expected.decoded_rgba_sha256);
    }
    // Nullable compatibility must not add a field or normalize a known date in retained snapshots.
    const dated = { ...example, created_at: '2000-01-01' }; assert.deepEqual(exampleSchema.parse(dated), dated);
  }
  assert.deepEqual((await readdir(path.join(projectRoot, 'public/images'))).sort(), expectedFiles.sort());
  assert.equal(expectedFiles.length, 8);
  const catgirl = catalog.prompts.find(prompt => prompt.id === 'chibi-catgirl-sticker')!;
  assert.equal(catgirl.body_format, 'tags');
  assert.equal(catgirl.template, 'chibi catgirl, super deformed, big head, tiny arms, simple background, pastel colors, sticker style, white outline');
  const tags = renderPrompt(catalog, { id: catgirl.id, expected_revision: catgirl.prompt_revision, variables: {}, format: 'tags', input_mode: 'reference-image', model: 'GPT' }); assert.ok(tags.ok); assert.equal(tags.data.prompt, catgirl.template); assert.equal(tags.data.format, 'tags');
  const noProse = renderPrompt(catalog, { id: catgirl.id, expected_revision: catgirl.prompt_revision, variables: {}, format: 'text' }); assert.ok(!noProse.ok); assert.equal(noProse.error.code, 'FORMAT_UNSUPPORTED');
  assert.equal(catgirlProof.entries[0].decoded_pixels_equal, true); assert.equal(catgirlProof.entries[0].source_png_unchanged, true);
  for (const query of ['catgirl', '猫娘', 'chibi catgirl']) {
    const result = searchPrompts(catalog, { query }); assert.ok(result.ok); assert.deepEqual(result.data.items.map(prompt => prompt.id), [catgirl.id]);
  }
  for (const input of [{ query: 'GPT' }, { model: 'GPT' }, { model: 'gpt' }, { model: 'GPT reference image' }]) {
    const result = searchPrompts(catalog, input); assert.ok(result.ok); assert.deepEqual(result.data.items.map(prompt => prompt.id), catalog.prompts.map(prompt => prompt.id));
  }
  const verified = searchPrompts(catalog, { model: 'GPT', verified_only: true }); assert.ok(verified.ok); assert.deepEqual(verified.data.items, []);
  assert.ok(catalog.prompts.find(prompt => prompt.id === 'vacant-chibi-avatar-redraw')!.template.includes('**负面约束：**'));
  for (const query of ['棉花娃娃', '毛绒娃娃', 'plush doll', 'cotton doll', '20cm']) {
    const found = searchPrompts(catalog, { query }); assert.ok(found.ok); assert.deepEqual(found.data.items.map(item => item.id), ['cotton-doll-20cm-character-redraw']);
  }
  const cotton = searchPrompts(catalog, { styles: ['cotton-doll'] }); assert.ok(cotton.ok); assert.deepEqual(cotton.data.items.map(item => item.id), ['cotton-doll-20cm-character-redraw']);
  assert.equal(cotton.data.facets.styles.find(style => style.id === 'cotton-doll')?.label, '棉花娃娃');
  for (const id of removedIds) { const result = getPrompt(catalog, { id }); assert.ok(!result.ok); assert.equal(result.error.code, 'NOT_FOUND'); }
});
