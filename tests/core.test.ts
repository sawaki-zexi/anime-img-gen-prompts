import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPrompt, promptCapabilities, renderPrompt, searchPrompts } from '../src/lib/catalog.ts';
import { singleCatalog as catalog, prompt } from './helpers.ts';

const renderInput = { id: prompt.id, expected_revision: prompt.prompt_revision, variables: {} };

test('search finds Chinese use cases, English aliases and Unicode normalized terms without returning full templates', () => {
  for (const query of ['壁纸', 'wallpaper', 'ＡＮＩＭＥ', '海边', '人物']) {
    const result = searchPrompts(catalog, { query });
    assert.ok(result.ok); assert.equal(result.data.items[0]!.id, prompt.id);
    assert.equal(result.catalog_revision, catalog.catalog_revision);
    assert.equal(result.data.items[0]!.prompt_revision, prompt.prompt_revision);
    assert.ok(!Object.hasOwn(result.data.items[0]!, 'template'));
    assert.ok(!JSON.stringify(result.data.items).includes(prompt.template));
  }
  const none = searchPrompts(catalog, { query: '不存在的检索词' });
  assert.ok(none.ok); assert.deepEqual(none.data.items, []); assert.equal(none.data.next_cursor, null);
});

test('get returns examples only on request and enforces current revision', () => {
  const defaultDetail = getPrompt(catalog, { id: prompt.id });
  assert.ok(defaultDetail.ok); assert.deepEqual(defaultDetail.data.examples, []);
  const full = getPrompt(catalog, { id: prompt.id, expected_revision: prompt.prompt_revision, include_examples: true });
  assert.ok(full.ok); assert.deepEqual(full.data, { ...prompt, capabilities: promptCapabilities(prompt) });
  for (const result of [getPrompt(catalog, { id: 'not-found' }), renderPrompt(catalog, { ...renderInput, id: 'not-found' })]) {
    assert.ok(!result.ok); assert.equal(result.error.code, 'NOT_FOUND');
  }
  for (const result of [getPrompt(catalog, { id: prompt.id, expected_revision: 'old-revision' }), renderPrompt(catalog, { ...renderInput, expected_revision: 'old-revision' })]) {
    assert.ok(!result.ok); assert.equal(result.error.code, 'REVISION_MISMATCH'); assert.equal(result.error.details.current_revision, prompt.prompt_revision);
  }
});

test('render respects defaults, performs one literal pass and preserves user newlines and language', () => {
  const value = 'An adult illustrator\n中文 😀 {subject} $&';
  const result = renderPrompt(catalog, { ...renderInput, variables: { subject: value } });
  assert.ok(result.ok);
  assert.equal(result.data.prompt, prompt.template.replace('{subject}', () => value));
  assert.equal(result.data.variables.subject, value);
  assert.ok(result.data.warnings.length > 0);
  assert.ok(!Object.hasOwn(result.data, 'negative_prompt'));
  const optional = structuredClone(catalog);
  optional.prompts[0]!.variables.subject = { ...prompt.variables.subject!, required: false };
  delete optional.prompts[0]!.variables.subject!.default;
  const empty = renderPrompt(optional, renderInput);
  assert.ok(empty.ok); assert.equal(empty.data.variables.subject, '');
});

test('missing required values and unknown variables fail without emitting a final prompt', () => {
  const withoutDefault = structuredClone(catalog);
  delete withoutDefault.prompts[0]!.variables.subject!.default;
  for (const result of [renderPrompt(withoutDefault, renderInput), renderPrompt(catalog, { ...renderInput, variables: { subject: '   ' } })]) {
    assert.ok(!result.ok); assert.equal(result.error.code, 'MISSING_VARIABLES'); assert.deepEqual(result.error.details.missing, ['subject']); assert.ok(!Object.hasOwn(result, 'data'));
  }
  const unknown = renderPrompt(catalog, { ...renderInput, variables: { unknown: 'x' } });
  assert.ok(!unknown.ok); assert.equal(unknown.error.code, 'INVALID_VARIABLES'); assert.deepEqual(unknown.error.details.unknown, ['unknown']);
  const prototypeName = renderPrompt(catalog, { ...renderInput, variables: { constructor: 'x' } });
  assert.ok(!prototypeName.ok); assert.equal(prototypeName.error.code, 'INVALID_VARIABLES');
});

test('value choices, variable lengths, query lengths and request shape are validated', () => {
  const constrained = structuredClone(catalog);
  constrained.prompts[0]!.variables.subject!.options = ['allowed'];
  const choice = renderPrompt(constrained, { ...renderInput, variables: { subject: 'different' } });
  assert.ok(!choice.ok); assert.equal(choice.error.code, 'INVALID_VARIABLES');
  const tooLong = renderPrompt(catalog, { ...renderInput, variables: { subject: '😀'.repeat(2001) } });
  assert.ok(!tooLong.ok); assert.equal(tooLong.error.code, 'INVALID_INPUT');
  const validLength = searchPrompts(catalog, { query: '😀'.repeat(256) });
  assert.ok(validLength.ok);
  const invalidLength = searchPrompts(catalog, { query: '😀'.repeat(257) });
  assert.ok(!invalidLength.ok); assert.equal(invalidLength.error.code, 'INVALID_INPUT');
  const tooMany = renderPrompt(catalog, { ...renderInput, variables: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`v${i}`, 'x'])) });
  assert.ok(!tooMany.ok); assert.equal(tooMany.error.code, 'INVALID_INPUT');
  const revisionRequired = renderPrompt(catalog, { id: prompt.id, variables: {} });
  assert.ok(!revisionRequired.ok); assert.equal(revisionRequired.error.code, 'INVALID_INPUT');
  for (const input of [{ styles: ['unknown-style'] }, { verified_only: true }, { limit: 21 }]) {
    const result = searchPrompts(catalog, input); assert.ok(!result.ok); assert.equal(result.error.code, 'INVALID_INPUT');
  }
});

test('explicitly incompatible models are rejected and unknown models are not called verified', () => {
  const scoped = structuredClone(catalog);
  scoped.prompts[0]!.model_compatibility = [{ model: 'incompatible-model', status: 'incompatible', note: 'Requires an unsupported input format' }];
  const result = renderPrompt(scoped, { ...renderInput, model: 'incompatible-model' });
  assert.ok(!result.ok); assert.equal(result.error.code, 'MODEL_INCOMPATIBLE');
  for (const input of [{ model: 'incompatible-model' }, { model: 'unknown-model', verified_only: true }]) {
    const found = searchPrompts(scoped, input); assert.ok(found.ok); assert.deepEqual(found.data.items, []);
  }
});

test('pagination is stable and a cursor cannot cross queries or catalog revisions', () => {
  const scoped = structuredClone(catalog);
  scoped.prompts.push({ ...structuredClone(prompt), id: 'z-second-entry' });
  const first = searchPrompts(scoped, { limit: 1 });
  assert.ok(first.ok); assert.ok(first.data.next_cursor);
  const second = searchPrompts(scoped, { limit: 1, cursor: first.data.next_cursor });
  assert.ok(second.ok); assert.equal(second.data.items[0]!.id, 'z-second-entry'); assert.equal(second.data.next_cursor, null);
  for (const input of [{ query: 'wallpaper', limit: 1, cursor: first.data.next_cursor }, { cursor: 'not-a-cursor' }]) {
    const result = searchPrompts(scoped, input); assert.ok(!result.ok); assert.equal(result.error.code, 'INVALID_CURSOR');
  }
  scoped.catalog_revision = `sha256:${'a'.repeat(64)}`;
  const stale = searchPrompts(scoped, { limit: 1, cursor: first.data.next_cursor });
  assert.ok(!stale.ok); assert.equal(stale.error.code, 'INVALID_CURSOR');
});
