import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSearchCatalog, renderPrompt, searchPrompts } from '../src/lib/catalog.ts';
import { searchInputSchema } from '../src/lib/schema.ts';
import { readSearchParams, writeSearchParams } from '../src/lib/search-url.ts';
import { catalog, prompt } from './helpers.ts';

function ids(input: unknown, source = catalog) {
  const found = searchPrompts(source, input); assert.ok(found.ok); return found.data.items.map(item => item.id);
}

test('all published purposes and aliases find their corresponding real content', () => {
  for (const term of catalog.taxonomy.use_cases) {
    for (const query of [term.label, ...term.aliases]) {
      const result = searchPrompts(catalog, { query, limit: 20 }); assert.ok(result.ok);
      assert.ok(result.data.items.some(item => item.use_cases.includes(term.id)), `${query} should find ${term.id}`);
    }
  }
  assert.deepEqual(ids({ query: 'watercolor wallpaper' }), ['seaside-watercolor-station']);
  assert.deepEqual(ids({ query: 'ＷＡＴＥＲＣＯＬＯＲ', use_cases: ['avatar'] }), ['mint-watercolor-avatar']);
  assert.deepEqual(ids({ query: 'cherry clouds', use_cases: ['wallpaper'] }), [prompt.id]);
  assert.deepEqual(ids({ query: 'hand-painted' }), ['mint-watercolor-avatar', 'seaside-watercolor-station']);
  assert.equal(ids({ query: 'anime' })[0], prompt.id);
});

test('same-dimension OR and cross-dimension AND preserve deterministic relevance and ID ordering', () => {
  assert.deepEqual(ids({ use_cases: ['avatar', 'scenery'], styles: ['watercolor'] }), ['mint-watercolor-avatar', 'seaside-watercolor-station']);
  assert.deepEqual(ids({ use_cases: ['avatar', 'scenery'], styles: ['retro-cel'] }), []);
  const all = searchPrompts(catalog, { limit: 20 }); assert.ok(all.ok);
  assert.deepEqual(all.data.items.map(item => item.id), catalog.prompts.map(item => item.id).sort());
  const first = searchPrompts(catalog); assert.ok(first.ok); assert.equal(first.data.items.length, 5); assert.ok(first.data.next_cursor);
  const last = searchPrompts(catalog, { cursor: first.data.next_cursor }); assert.ok(last.ok);
  assert.equal(last.data.items.length, 1); assert.equal(last.data.next_cursor, null);
  assert.equal(new Set([...first.data.items, ...last.data.items].map(item => item.id)).size, 6);
  for (const input of [{ query: 'different', cursor: first.data.next_cursor }, { use_cases: ['avatar'], cursor: first.data.next_cursor }, { styles: ['watercolor'], cursor: first.data.next_cursor }, { model: 'x', cursor: first.data.next_cursor }, { limit: 20, cursor: first.data.next_cursor }]) {
    const result = searchPrompts(catalog, input); assert.ok(!result.ok); assert.equal(result.error.code, 'INVALID_CURSOR');
  }
  const clone = structuredClone(catalog); clone.catalog_revision = `sha256:${'1'.repeat(64)}`;
  const stale = searchPrompts(clone, { cursor: first.data.next_cursor }); assert.ok(!stale.ok); assert.equal(stale.error.code, 'INVALID_CURSOR');
  for (const input of [{ query: 'aqua', limit: 20 }, { query: '水彩', styles: ['watercolor'] }, {}]) assert.deepEqual(searchPrompts(catalog, input), searchPrompts(createSearchCatalog(catalog), input));
});

test('model vocabulary aliases retain verified, declared, incompatible and unknown evidence semantics', () => {
  const scoped = structuredClone(catalog);
  scoped.taxonomy.models = [{ id: 'fixture-model', label: '夹具模型', aliases: ['Fixture Alias'] }];
  scoped.prompts.forEach((item, index) => { item.model_compatibility = index < 3 ? [{ model: 'fixture-model', status: (['verified', 'declared', 'incompatible'] as const)[index]!, note: '仅测试夹具中的模拟证据' }] : []; });
  assert.equal(ids({ model: 'Fixture Alias', limit: 20 }, scoped).length, 5);
  assert.deepEqual(ids({ model: '夹具模型', verified_only: true }, scoped), [scoped.prompts[0]!.id]);
  const bad = scoped.prompts[2]!;
  const rendered = renderPrompt(scoped, { id: bad.id, expected_revision: bad.prompt_revision, variables: {}, model: 'Fixture Alias' });
  assert.ok(!rendered.ok); assert.equal(rendered.error.code, 'MODEL_INCOMPATIBLE');
  const unknown = renderPrompt(scoped, { id: scoped.prompts[3]!.id, expected_revision: scoped.prompts[3]!.prompt_revision, variables: {}, model: 'fixture-model' });
  assert.ok(unknown.ok); assert.ok(unknown.data.warnings.length > 0);
  assert.deepEqual(ids({ model: 'unrecognized-model', verified_only: true }), []);
});

test('share URLs preserve the complete query, repeated filters, model, verification, page size and cursor', () => {
  const first = searchPrompts(catalog, { use_cases: ['illustration', 'wallpaper'], limit: 1 }); assert.ok(first.ok); assert.ok(first.data.next_cursor);
  const input = searchInputSchema.parse({ query: '海边 😀', use_cases: ['wallpaper', 'illustration'], styles: ['watercolor', 'anime-key-visual'], model: 'Fixture Model', verified_only: true, limit: 1, cursor: first.data.next_cursor });
  const restored = searchInputSchema.parse(readSearchParams(writeSearchParams(input)));
  assert.deepEqual({ ...restored, use_cases: restored.use_cases.sort(), styles: restored.styles.sort() }, { ...input, use_cases: input.use_cases.sort(), styles: input.styles.sort() });
  const filters = searchInputSchema.parse({ use_cases: ['illustration', 'wallpaper'], limit: 1, cursor: first.data.next_cursor });
  assert.deepEqual(searchPrompts(catalog, readSearchParams(writeSearchParams(filters))), searchPrompts(catalog, filters));
  const malformed = searchPrompts(catalog, readSearchParams(new URLSearchParams('verified=maybe&limit=NaN'))); assert.ok(!malformed.ok); assert.equal(malformed.error.code, 'INVALID_INPUT');
});

test('optional negative templates are independently rendered and variable failures expose concrete reasons', () => {
  const scoped = { ...structuredClone(catalog), prompts: [structuredClone(prompt)] };
  const entry = scoped.prompts[0]!;
  entry.negative_template = 'avoid captions\nexclude {subject}';
  entry.variables.subject!.max_length = 10;
  const result = renderPrompt(scoped, { id: entry.id, expected_revision: entry.prompt_revision, variables: { subject: '测试 $&' } });
  assert.ok(result.ok); assert.equal(result.data.negative_prompt, 'avoid captions\nexclude 测试 $&');
  assert.ok(!result.data.prompt.includes('avoid captions'));
  const bad = renderPrompt(scoped, { id: entry.id, expected_revision: entry.prompt_revision, variables: { subject: 'a'.repeat(11) } });
  assert.ok(!bad.ok); assert.equal(bad.error.code, 'INVALID_VARIABLES'); assert.deepEqual(bad.error.details.invalid, { subject: '最多 10 个 Unicode 字符' });
});
