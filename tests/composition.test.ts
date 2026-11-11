import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import matter from 'gray-matter';
import { buildCatalog } from '../src/content/build.ts';
import { createSearchCatalog, getPrompt, renderPrompt, searchPrompts } from '../src/lib/catalog.ts';
import { canonicalJson } from '../src/lib/revision.ts';
import { catalogSchema } from '../src/lib/schema.ts';
import { validateSnapshot } from '../src/server/snapshots.ts';
import { catalog as legacy, fixture, productionCatalog } from './helpers.ts';
import { compositionCatalog as catalog, compositionRecords } from './fixtures/catalog-data.ts';

const dual = catalog.prompts.find(item => item.id === 'fixture-dual')!;
const tags = catalog.prompts.find(item => item.id === 'fixture-tags')!;
const text = catalog.prompts.find(item => item.id === 'fixture-text-only')!;
const args = (prompt = dual) => ({ id: prompt.id, expected_revision: prompt.prompt_revision, variables: {} });

test('search advertises bounded real excerpts and capabilities without defaults, variants or preset bodies', () => {
  const index = createSearchCatalog(catalog);
  const result = searchPrompts(index); assert.ok(result.ok);
  for (const prompt of catalog.prompts) {
    const summary = result.data.items.find(item => item.id === prompt.id)!;
    const prefix = summary.excerpt.slice(0, -1);
    assert.ok(prompt.template.startsWith(prefix)); assert.ok(prefix.length < prompt.template.length);
    assert.ok([...prefix].length <= 150);
    assert.ok(!JSON.stringify(index).includes(prompt.template));
    assert.ok(!Object.hasOwn(summary, 'variables')); assert.ok(!Object.hasOwn(summary, 'customization'));
  }
  assert.deepEqual(result.data.items.find(item => item.id === dual.id)!.capabilities, { formats: ['text', 'tags'], input_modes: ['reference-image', 'text'], customization: true });
  assert.deepEqual(result.data.items.find(item => item.id === tags.id)!.capabilities, { formats: ['tags'], input_modes: ['direct'], customization: true });
  const detail = getPrompt(catalog, { id: dual.id }); assert.ok(detail.ok);
  assert.equal(detail.data.customization!.presets[0]!.id, 'happy');
  assert.equal(detail.data.tag_template, 'test-only portrait, {subject}, {tag_detail}');
  const short = structuredClone(catalog); short.prompts[0]!.template = 'cat';
  const shortIndex = createSearchCatalog(short);
  assert.equal(shortIndex.prompts[0]!.excerpt, 'c…');
  assert.ok(!JSON.stringify(shortIndex.prompts[0]).includes('"template"'));
});

test('text, tags and dual-format templates select actual authored text, negatives and default modes', () => {
  const prose = renderPrompt(catalog, { ...args(), format: 'text', input_mode: 'text', variables: { subject: 'an adult traveler' } });
  assert.ok(prose.ok); assert.equal(prose.data.prompt, 'TEST FIXTURE portrait of an adult traveler. Use a framed composition.'); assert.equal(prose.data.negative_prompt, 'Avoid a blurred frame.');
  const tagResult = renderPrompt(catalog, { ...args(), format: 'tags', input_mode: 'reference-image', variables: { subject: 'an adult traveler' } });
  assert.ok(tagResult.ok); assert.equal(tagResult.data.prompt, 'test-only portrait, an adult traveler, flat colors'); assert.equal(tagResult.data.negative_prompt, 'blur, test-only negative');
  const tagPrimary = renderPrompt(catalog, args(tags)); assert.ok(tagPrimary.ok);
  assert.equal(tagPrimary.data.format, 'tags'); assert.equal(tagPrimary.data.input_mode, 'direct'); assert.equal(tagPrimary.data.prompt, tags.template);
  const textOnly = renderPrompt(catalog, args(text)); assert.ok(textOnly.ok); assert.equal(textOnly.data.format, 'text'); assert.equal(textOnly.data.input_mode, 'text');
  const image = renderPrompt(catalog, args()); assert.ok(image.ok); assert.equal(image.data.input_mode, 'reference-image');
});

test('presets use their authored format, canonical order and literal custom values; empty additions restore the base', () => {
  const custom = '  (wide eyes:1.25), {subject}, $&\n中文 😀  ';
  const prose = renderPrompt(catalog, { ...args(), variables: { subject: 'an adult' }, additions: { preset_ids: ['blush', 'happy'], custom } });
  assert.ok(prose.ok);
  assert.equal(prose.data.prompt, 'TEST FIXTURE portrait of an adult. Use a framed composition.\n\nGive the character a happy smile.\n\nAdd rosy cheeks.\n\n' + custom);
  const tagResult = renderPrompt(catalog, { ...args(), variables: { subject: 'an adult' }, format: 'tags', additions: { preset_ids: ['happy', 'blush'], custom } });
  assert.ok(tagResult.ok); assert.equal(tagResult.data.prompt, 'test-only portrait, an adult, flat colors, happy smile, blush, ' + custom);
  for (const additions of [{}, { preset_ids: [] }, { custom: '' }, { preset_ids: [], custom: '' }]) assert.deepEqual(renderPrompt(catalog, { ...args(), additions }), renderPrompt(catalog, args()));
  const whitespace = renderPrompt(catalog, { ...args(tags), additions: { custom: ' \n ' } }); assert.ok(whitespace.ok); assert.equal(whitespace.data.prompt, tags.template + ',  \n ');
});

test('unsupported formats, modes and additions fail explicitly; malformed, unknown, duplicate and grouped choices never render', () => {
  const cases = [
    [{ ...args(text), format: 'tags' }, 'FORMAT_UNSUPPORTED'],
    [{ ...args(tags), format: 'text' }, 'FORMAT_UNSUPPORTED'],
    [{ ...args(tags), input_mode: 'reference-image' }, 'INPUT_MODE_UNSUPPORTED'],
    [{ ...args(text), additions: { custom: 'happy' } }, 'ADDITIONS_UNSUPPORTED'],
    [{ ...args(), additions: { preset_ids: ['invented'] } }, 'INVALID_ADDITIONS'],
    [{ ...args(), additions: { preset_ids: ['happy', 'happy'] } }, 'INVALID_ADDITIONS'],
    [{ ...args(), additions: { preset_ids: ['happy', 'angry'] } }, 'INVALID_ADDITIONS'],
    [{ ...args(), additions: { group: 'expression' } }, 'INVALID_INPUT'],
    [{ ...args(), additions: { custom: '😀'.repeat(2001) } }, 'INVALID_INPUT'],
    [{ ...args(), additions: { preset_ids: Array.from({ length: 33 }, () => 'happy') } }, 'INVALID_INPUT'],
    [{ ...args(), format: 'invented' }, 'INVALID_INPUT'],
    [{ ...args(), input_mode: 'upload' }, 'INVALID_INPUT'],
    [{ ...args(), unknown: true }, 'INVALID_INPUT'],
  ] as const;
  for (const [input, code] of cases) {
    const result = renderPrompt(catalog, input); assert.ok(!result.ok, JSON.stringify(input)); assert.equal(result.error.code, code); assert.ok(!Object.hasOwn(result, 'data'));
  }
  const noCustom = structuredClone(catalog); noCustom.prompts.find(item => item.id === dual.id)!.customization!.allow_custom = false;
  const denied = renderPrompt(noCustom, { ...args(), additions: { custom: 'literal' } }); assert.ok(!denied.ok); assert.equal(denied.error.code, 'INVALID_ADDITIONS');
  const unavailable = structuredClone(catalog); delete unavailable.prompts.find(item => item.id === dual.id)!.customization!.presets[0]!.values.tags;
  const wrongFormat = renderPrompt(unavailable, { ...args(), format: 'tags', additions: { preset_ids: ['happy'] } }); assert.ok(!wrongFormat.ok); assert.equal(wrongFormat.error.code, 'INVALID_ADDITIONS');
});

test('only the selected body and its negative require variables; replacement and custom additions each remain literal', () => {
  const scoped = structuredClone(catalog), prompt = scoped.prompts.find(item => item.id === dual.id)!;
  for (const value of Object.values(prompt.variables)) delete value.default;
  const prose = renderPrompt(scoped, { ...args(), format: 'text', variables: { subject: '😀 {tag_detail} $&', prose_detail: 'ink lines', text_negative: 'smudges' }, additions: { custom: '{prose_detail}' } });
  assert.ok(prose.ok); assert.equal(prose.data.prompt, 'TEST FIXTURE portrait of 😀 {tag_detail} $&. ink lines.\n\n{prose_detail}');
  assert.equal(prose.data.negative_prompt, 'Avoid smudges.');
  const tagResult = renderPrompt(scoped, { ...args(), format: 'tags', variables: { subject: 'an adult', tag_detail: 'blue', tag_negative: 'blur' } }); assert.ok(tagResult.ok);
  const missingProse = renderPrompt(scoped, { ...args(), format: 'text', variables: { subject: 'an adult' } }); assert.ok(!missingProse.ok); assert.deepEqual(missingProse.error.details.missing, ['prose_detail', 'text_negative']);
  const missingTags = renderPrompt(scoped, { ...args(), format: 'tags', variables: { subject: 'an adult' } }); assert.ok(!missingTags.ok); assert.deepEqual(missingTags.error.details.missing, ['tag_detail', 'tag_negative']);
});

test('legacy schema-1 frozen snapshots retain identical canonical bytes, hashes and basic render arguments', async () => {
  // Pinned before any composition metadata was authored; recomputing a new fixture digest cannot pass this gate.
  assert.equal(legacy.catalog_revision, 'sha256:b6540beef3eabf6f5a06ef954c24b5616572471c060e5ca72f9490f6bd724e59');
  const bytes = canonicalJson(legacy);
  const checked = await validateSnapshot(JSON.parse(bytes));
  assert.equal(canonicalJson(checked), bytes); assert.equal(checked.catalog_revision, legacy.catalog_revision); assert.ok(Object.isFrozen(checked));
  assert.deepEqual(catalogSchema.parse(checked), legacy);
  for (const prompt of checked.prompts) {
    for (const field of ['body_format', 'tag_template', 'tag_negative_template', 'input_modes', 'character_variable', 'customization']) assert.ok(!Object.hasOwn(prompt, field));
    const old = renderPrompt(checked, args(prompt)); assert.ok(old.ok); assert.equal(old.data.prompt, prompt.examples[0]!.effective_prompt);
    const noAdditions = renderPrompt(checked, { ...args(prompt), additions: { preset_ids: [], custom: '' } }); assert.deepEqual(noAdditions, old);
  }
  for (const prompt of productionCatalog.prompts) {
    const rejected = renderPrompt(productionCatalog, { ...args(prompt), additions: { custom: 'happy' } }); assert.ok(!rejected.ok); assert.equal(rejected.error.code, 'ADDITIONS_UNSUPPORTED');
    assert.deepEqual(prompt.input_modes, ['reference-image']); assert.equal(prompt.tag_template, undefined); assert.equal(prompt.customization, undefined);
  }
});

test('authored composition variants build and validate together, including per-format variable declarations', async t => {
  const files = await fixture(); t.after(files.cleanup);
  for (const record of compositionRecords) await writeFile(path.join(files.contentDir, 'prompts', `${record.authored.id}.md`), matter.stringify(record.template, record.authored));
  const built = await buildCatalog(files);
  assert.deepEqual(built.prompts.filter(item => item.id.startsWith('fixture-dual') || item.id === tags.id || item.id === text.id), catalog.prompts);
  const filename = path.join(files.contentDir, 'prompts', 'fixture-dual.md');
  const original = await readFile(filename, 'utf8');
  for (const [change, error] of [
    [(value: any) => { value.input_modes = ['reference-image', 'direct']; }, /直接使用/],
    [(value: any) => { value.input_modes = ['text', 'text']; }, /使用方式重复/],
    [(value: any) => { value.character_variable = 'missing'; }, /角色描述/],
    [(value: any) => { value.tag_negative_template = '{missing}'; }, /未声明 missing/],
    [(value: any) => { value.customization.presets.push(value.customization.presets[0]); }, /ID 重复/],
    [(value: any) => { value.body_format = 'tags'; }, /标签正文/],
  ] as const) {
    const document = matter(original), data = structuredClone(document.data); change(data);
    await writeFile(filename, matter.stringify(document.content, data)); await assert.rejects(buildCatalog(files), error);
  }
});
