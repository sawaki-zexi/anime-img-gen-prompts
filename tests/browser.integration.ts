import assert from 'node:assert/strict';
import { cp, copyFile, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { buildCatalog, writeCatalog } from '../src/content/build.ts';
import { searchPrompts } from '../src/lib/catalog.ts';
import { readSearchParams } from '../src/lib/search-url.ts';
import { runProcess } from './browser-helper.ts';
import { browserTestResources } from './browser-resources.ts';
import { catalog, productionCatalog, fixture, projectRoot, prompt } from './helpers.ts';
import type { Catalog } from '../src/lib/schema.ts';
import { syntheticCatalog } from '../benchmarks/fixture.ts';

const visibleIds = `Array.from(document.querySelectorAll('#prompt-grid [data-prompt-id]'), item => item.dataset.promptId)`;

test('real production gallery preserves full images and copies all user originals with reference-image and unknown-generation conditions', { timeout: 120000 }, async t => {
  const resources = browserTestResources(t), files = await resources.fixture();
  const server = await resources.serve(path.join(projectRoot, 'dist'));
  const browser = await resources.browser(path.join(files.directory, 'chrome'));
  const proof = JSON.parse(await readFile(path.join(projectRoot, 'docs/validation/evidence/content-replacement-hashes.json'), 'utf8'));
  await browser.viewport(360, true);
  await browser.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }, false);
  await browser.navigate(server.origin, `${visibleIds}.length === ${productionCatalog.prompts.length}`);
  assert.deepEqual(await browser.evaluate(visibleIds), productionCatalog.prompts.map(prompt => prompt.id));
  assert.ok((await browser.evaluate<string>('document.querySelector(".hero-credit").textContent')).includes('收录配图'));
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
  assert.equal(await browser.evaluate(`[...document.querySelectorAll('#prompt-grid .card-art-link')].every(frame => getComputedStyle(frame).aspectRatio === '1 / 1' && getComputedStyle(frame.querySelector('img')).objectFit === 'contain')`), true);
  for (const prompt of productionCatalog.prompts) {
    await browser.navigate(`${server.origin}/prompts/${prompt.id}/`, `document.querySelector('#original-prompt')?.value.length > 0`);
    await browser.wait(`document.querySelector('.detail-art img')?.naturalWidth > 0`);
    const dimensions = await browser.evaluate(`(() => { const image = document.querySelector('.detail-art img'); return { width: image.naturalWidth, height: image.naturalHeight, fit: getComputedStyle(image).objectFit, boxWidth: image.getBoundingClientRect().width, boxHeight: image.getBoundingClientRect().height }; })()`);
    assert.equal(dimensions.width, prompt.examples[0]!.width); assert.equal(dimensions.height, prompt.examples[0]!.height); assert.equal(dimensions.fit, 'contain');
    assert.ok(Math.abs(dimensions.boxWidth / dimensions.boxHeight - dimensions.width / dimensions.height) < 0.01);
    assert.equal(await browser.evaluate('document.querySelector("#original-prompt").value'), prompt.template);
    assert.equal(await browser.evaluate('document.querySelector("#rendered-prompt").value'), prompt.template);
    assert.equal(await browser.evaluate('document.querySelectorAll("#variables-form [data-variable]").length'), 0);
    const text = await browser.evaluate<string>('document.body.textContent');
    assert.ok(text.includes('原角色参考图')); assert.ok(text.includes('不自动替代用户角色')); assert.ok(text.includes('生成日期未提供'));
    assert.ok(!text.includes('实际生成示例'));
    for (const id of proof.removed_ids) assert.ok(!text.includes(id));
    await browser.click('.source-card details summary');
    assert.equal(await browser.evaluate('document.querySelector(".source-card").scrollWidth <= document.querySelector(".source-card").clientWidth'), true);
    await browser.tabTo('#copy-original'); await browser.key('Enter'); await browser.wait(`document.querySelector('#original-copy-status').textContent.includes('已复制')`);
    assert.equal((await browser.evaluate<string>('navigator.clipboard.readText()')).replaceAll('\r\n', '\n'), prompt.template);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
  }
  for (const requested of server.requests) for (const id of proof.removed_ids) assert.ok(!requested.includes(id));
  await browser.viewport(1280);
  await browser.navigate(server.origin, `${visibleIds}.length === ${productionCatalog.prompts.length}`);
  assert.equal(await browser.evaluate(`[...document.querySelectorAll('#prompt-grid .card-art-link')].every(frame => getComputedStyle(frame).aspectRatio === '1 / 1' && getComputedStyle(frame.querySelector('img')).objectFit === 'contain')`), true);
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
  for (const prompt of productionCatalog.prompts) {
    await browser.navigate(`${server.origin}/prompts/${prompt.id}/`, `document.querySelector('.detail-art img')?.naturalWidth > 0`);
    assert.equal(await browser.evaluate(`(() => { const image = document.querySelector('.detail-art img'); return getComputedStyle(image).objectFit === 'contain' && Math.abs(image.getBoundingClientRect().width / image.getBoundingClientRect().height - image.naturalWidth / image.naturalHeight) < 0.01 && document.documentElement.scrollWidth <= innerWidth + 1; })()`), true);
  }
  assert.deepEqual(browser.errors, []);
});

async function buildFixtureSite(files: Awaited<ReturnType<typeof fixture>>, suppliedCatalog?: Catalog) {
  await cp(path.join(projectRoot, 'src'), path.join(files.directory, 'src'), { recursive: true });
  for (const filename of ['astro.config.mjs', 'tsconfig.json', 'package.json']) await copyFile(path.join(projectRoot, filename), path.join(files.directory, filename));
  await mkdir(path.join(files.directory, 'generated'), { recursive: true });
  await symlink(path.join(projectRoot, 'node_modules'), path.join(files.directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const built = suppliedCatalog ?? await buildCatalog(files); await writeCatalog(built, files.directory);
  await runProcess(process.execPath, [path.join(projectRoot, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', files.directory], files.directory);
  return built;
}

test('real mobile browser follows keyboard filters, pagination, share URLs, details and clipboard fallbacks', { timeout: 120000 }, async t => {
  const resources = browserTestResources(t);
  const files = await resources.fixture();
  await buildFixtureSite(files);
  const server = await resources.serve(path.join(files.directory, 'dist'));
  const browser = await resources.browser(path.join(files.directory, 'chrome'));
  const firstPage = searchPrompts(catalog); assert.ok(firstPage.ok && firstPage.data.next_cursor);
  const secondPage = searchPrompts(catalog, { cursor: firstPage.data.next_cursor }); assert.ok(secondPage.ok);
  const secondPageIds = secondPage.data.items.map(item => item.id);
  const avatarIds = catalog.prompts.filter(item => item.use_cases.includes('avatar')).map(item => item.id).sort().slice(0, 5);
  await browser.viewport(360, true);
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }] });
  await browser.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }, false);
  await browser.navigate(server.origin, `document.querySelector('#result-count')?.textContent.includes('5')`);
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
  assert.equal(server.requests.filter(value => value.startsWith('/data/prompts/')).length, 0);
  assert.ok(server.requests.filter(value => /\.webp$/.test(value) && !value.endsWith('-thumb.webp')).every(value => value.endsWith('fixture-avatar.webp')));
  await browser.tabTo('#next-page'); await browser.key('Enter');
  await browser.wait(`(${visibleIds}).join(',') === ${JSON.stringify(secondPageIds.join(','))}`);
  const pageUrl = await browser.evaluate<string>('location.href');
  const expected = searchPrompts(catalog, readSearchParams(new URL(pageUrl).searchParams)); assert.ok(expected.ok);
  assert.deepEqual(await browser.evaluate(visibleIds), expected.data.items.map(item => item.id));
  await browser.navigate(pageUrl, `(${visibleIds}).join(',') === ${JSON.stringify(secondPageIds.join(','))}`);
  assert.deepEqual(await browser.evaluate(visibleIds), expected.data.items.map(item => item.id));
  await browser.click('#clear-search');
  await browser.tabTo('[name=use_case][value=avatar]'); await browser.key(' ');
  await browser.wait(`(${visibleIds}).join(',') === ${JSON.stringify(avatarIds.join(','))}`);
  assert.deepEqual(await browser.evaluate(visibleIds), avatarIds);
  await browser.tabTo('.card-art-link'); await browser.key('Enter');
  await browser.wait(`document.querySelector('#variable-subject') && document.querySelector('#rendered-prompt')?.value.length > 0`);
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
  await browser.tabTo('#variable-subject'); await browser.replace('my adult traveler\n中文 $& {subject}');
  // SSR supplies a default preview; wait for client-side variable handling before exercising copy.
  await browser.wait(`document.querySelector('#rendered-prompt').value.includes(${JSON.stringify('my adult traveler\n中文 $& {subject}')})`);
  await browser.tabTo('#copy-rendered'); await browser.key('Enter');
  await browser.wait(`document.querySelector('#render-copy-status').textContent.includes('已复制')`);
  // The Windows system clipboard exposes line breaks as CRLF.
  const copied = (await browser.evaluate<string>('navigator.clipboard.readText()')).replaceAll('\r\n', '\n');
  assert.equal(copied, await browser.evaluate('document.querySelector("#rendered-prompt").value'));
  assert.ok(copied.includes('my adult traveler\n中文 $& {subject}'));
  await browser.click('#variable-subject'); await browser.key('a', 2); await browser.key('Backspace');
  await browser.wait(`document.querySelector('#copy-rendered').disabled`);
  assert.ok((await browser.evaluate<string>('document.querySelector("#render-error").textContent')).includes('头像主体'));
  assert.equal(await browser.evaluate('document.querySelector("#rendered-prompt").value'), '');
  await browser.click('.reset-variables'); await browser.wait(`!document.querySelector('#copy-rendered').disabled`);
  await browser.evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } })`);
  await browser.tabTo('#copy-original'); await browser.key('Enter');
  await browser.wait(`document.activeElement.id === 'original-prompt'`);
  assert.equal(await browser.evaluate('document.activeElement.selectionEnd - document.activeElement.selectionStart'), await browser.evaluate('document.activeElement.value.length'));
  await browser.navigate(`${server.origin}/?q=does-not-exist&use_case=wallpaper&style=watercolor&model=unknown&verified=1&limit=10`, `!document.querySelector('#empty-state')?.hidden`);
  assert.ok((await browser.evaluate<string>('document.querySelector("#applied-filters").textContent')).includes('壁纸'));
  assert.equal(await browser.evaluate('document.querySelector("#model-filter").value'), 'unknown');
  assert.equal(await browser.evaluate('document.querySelector("[name=verified]").checked'), true);
  assert.equal(await browser.evaluate('document.querySelector("#page-size").value'), '10');
  await browser.click('#empty-reset'); await browser.wait(`${visibleIds}.length === 5`);
  await browser.tabTo('.card-copy'); await browser.key('Enter');
  await browser.wait(`document.querySelector('.copy-status').textContent.includes('已复制')`);
  assert.equal(server.requests.filter(value => value.startsWith('/data/prompts/')).length, 1);
  assert.deepEqual(browser.errors, []);
});

test('1000 synthetic records keep unique-image first-screen requests and template bodies bounded by the visible page', { timeout: 180000 }, async t => {
  const resources = browserTestResources(t);
  const files = await resources.fixture();
  const synthetic = await syntheticCatalog(catalog);
  await buildFixtureSite(files, synthetic);
  const aliases = new Map<string, string>();
  for (let index = 0; index < synthetic.prompts.length; index++) {
    const source = catalog.prompts[index % catalog.prompts.length]!.examples[0]!;
    for (const field of ['image', 'thumbnail'] as const) aliases.set(new URL(synthetic.prompts[index]!.examples[0]![field]).pathname, `.${new URL(source[field]).pathname}`);
  }
  const server = await resources.serve(path.join(files.directory, 'dist'), aliases);
  const browser = await resources.browser(path.join(files.directory, 'chrome'));
  await browser.viewport(1440);
  await browser.send('Network.setCacheDisabled', { cacheDisabled: true });
  // The SSR page already contains five cards. The restored query proves the large client index has initialized.
  await browser.navigate(`${server.origin}/?q=fixture`, `${visibleIds}.length === 5 && document.querySelector('#applied-filters')?.textContent.includes('fixture') && document.querySelector('.hero-art')?.naturalWidth > 0`);
  await browser.wait(`Array.from(document.querySelectorAll('#prompt-grid img')).filter(image => image.getBoundingClientRect().top < innerHeight).every(image => image.complete)`);
  const firstScreenImages = [...new Set(server.requests.filter(value => value.endsWith('.webp')))];
  assert.ok(firstScreenImages.length <= 6, `Expected hero + at most 5 card images, saw ${firstScreenImages.length}`);
  assert.ok(firstScreenImages.every(value => value.includes('/images/benchmark/synthetic-fixture-')));
  assert.equal(server.requests.filter(value => value.startsWith('/data/prompts/')).length, 0);
  assert.equal(await browser.evaluate('document.querySelectorAll("#prompt-grid [data-prompt-id]").length'), 5);
  assert.equal(await browser.evaluate('document.querySelector("#catalog-data").textContent.includes("effective_prompt")'), false);
  await browser.send('Browser.grantPermissions', { origin: server.origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }, false);
  await browser.click('.card-copy'); await browser.wait(`document.querySelector('.card-copy-fallback textarea').value.length > 0 && /已复制|文本已选中/.test(document.querySelector('.copy-status').textContent)`);
  assert.equal(server.requests.filter(value => value.startsWith('/data/prompts/')).length, 1);
  await browser.click('#next-page'); await browser.wait(`${visibleIds}[0] === 'synthetic-fixture-0005'`);
  assert.equal(await browser.evaluate('document.querySelectorAll("#prompt-grid [data-prompt-id]").length'), 5);
  assert.deepEqual(browser.errors, []);
  console.log(JSON.stringify({ fixture: 'synthetic; not published', total_records: 1000, viewport: '1440x950', first_screen_unique_image_requests: firstScreenImages.length, initial_body_requests: 0, after_one_copy_body_requests: 1, rendered_cards_per_page: 5, image_urls: 'unique per record; fixture server maps to reused real pixels; browser cache disabled' }));
});

test('real browser renders negative prompts, field limits, new taxonomy and archived routes using isolated content fixtures', { timeout: 120000 }, async t => {
  const resources = browserTestResources(t);
  const files = await resources.fixture();
  await files.edit(data => ({ data: { ...data, id: 'fixture-negative', title: '测试夹具 · 负面模板', template_version: '2', variables: { subject: { label: '测试主体', description: '测试输入', required: true, max_length: 20, default: 'default' }, mood: { label: '测试选项', description: '测试选择', required: false, options: ['calm', 'bright'], default: 'calm', max_length: 20 } }, use_cases: ['book-cover'], negative_template: 'avoid {subject}\nno captions', related_ids: [] }, body: 'A fixture {subject}\nMood {mood}' }), 'fixture-negative.md');
  await files.edit((data, body) => ({ data: { ...data, status: 'archived', related_ids: ['fixture-negative'], archive_note: '仅供自动验收的归档记录' }, body }));
  const taxonomyPath = path.join(files.contentDir, 'taxonomy.json');
  const taxonomy = JSON.parse(await readFile(taxonomyPath, 'utf8'));
  taxonomy.use_cases.push({ id: 'book-cover', label: '书封', aliases: ['book cover'] });
  await writeFile(taxonomyPath, JSON.stringify(taxonomy));
  const built = await buildFixtureSite(files);
  assert.equal(built.prompts.length, catalog.prompts.length);
  assert.ok(!built.prompts.some(item => item.id === prompt.id));
  const server = await resources.serve(path.join(files.directory, 'dist'));
  const browser = await resources.browser(path.join(files.directory, 'chrome'));
  await browser.viewport(360, true);
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } })` });
  await browser.navigate(server.origin, `document.querySelector('#result-count')?.textContent.includes('5') && document.querySelector('.hero-art')?.naturalWidth > 0`);
  assert.ok((await browser.evaluate<string>('document.querySelector(".hero-credit").textContent')).includes(built.prompts[0]!.title));
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
  await browser.navigate(`${server.origin}/?use_case=book-cover`, `${visibleIds}.length === 1`);
  assert.equal(await browser.evaluate('document.querySelector("[value=book-cover]").checked'), true);
  await browser.click('.card-art-link'); await browser.wait(`document.querySelector('#rendered-negative')?.value === 'avoid default\\nno captions'`);
  assert.equal(await browser.evaluate('document.querySelector("#rendered-prompt").value'), 'A fixture default\nMood calm');
  await browser.click('#variable-subject'); await browser.replace('x'.repeat(21));
  await browser.wait(`document.querySelector('#copy-rendered-negative').disabled`);
  assert.ok((await browser.evaluate<string>('document.querySelector("#render-error").textContent')).includes('20'));
  assert.equal(await browser.evaluate('document.querySelector("#rendered-negative").value'), '');
  await browser.replace('changed');
  await browser.tabTo('#variable-mood'); await browser.key(' '); await browser.key('ArrowDown'); await browser.key('Enter');
  await browser.wait(`document.querySelector('#rendered-prompt').value.includes('bright')`);
  await browser.tabTo('#copy-rendered-negative'); await browser.key('Enter');
  await browser.wait(`document.activeElement.id === 'rendered-negative'`);
  assert.equal(await browser.evaluate('document.activeElement.value'), 'avoid changed\nno captions');
  await browser.tabTo('#copy-original-negative'); await browser.key('Enter');
  await browser.wait(`document.activeElement.id === 'original-negative'`);
  assert.equal(await browser.evaluate('document.activeElement.value'), 'avoid {subject}\nno captions');
  await browser.navigate(`${server.origin}/prompts/${prompt.id}/`, `document.querySelector('#archive-title')`);
  const archive = await browser.evaluate<string>('document.body.textContent');
  assert.ok(archive.includes('已归档')); assert.ok(archive.includes(prompt.title)); assert.ok(archive.includes('测试夹具 · 负面模板')); assert.ok(!archive.includes(prompt.template));
  assert.equal(await browser.evaluate('location.pathname'), `/prompts/${prompt.id}/`);
  assert.equal(await browser.evaluate('document.querySelector("#original-prompt")'), null);
  assert.equal((await fetch(`${server.origin}/data/prompts/${prompt.id}.json`)).status, 404);
  await browser.click('.archived-card ul a'); await browser.wait(`document.querySelector('#rendered-negative')`);
  assert.deepEqual(browser.errors, []);
});

test('an empty published catalog still builds a usable homepage without a hero record or card template item', { timeout: 120000 }, async t => {
  const resources = browserTestResources(t);
  const files = await resources.fixture();
  const emptyContent = path.join(files.directory, 'empty-content');
  await mkdir(path.join(emptyContent, 'prompts'), { recursive: true });
  await copyFile(path.join(files.contentDir, 'taxonomy.json'), path.join(emptyContent, 'taxonomy.json'));
  const built = await buildFixtureSite({ ...files, contentDir: emptyContent });
  assert.equal(built.prompts.length, 0);
  const server = await resources.serve(path.join(files.directory, 'dist'));
  const browser = await resources.browser(path.join(files.directory, 'chrome'));
  await browser.viewport(360, true);
  await browser.navigate(server.origin, `document.readyState === 'complete' && document.querySelector('#result-count')?.textContent.includes('0') && !document.querySelector('#empty-state')?.hidden`);
  assert.equal(await browser.evaluate(visibleIds).then(items => items.length), 0);
  assert.equal(await browser.evaluate('document.querySelector(".hero-art")'), null);
  assert.ok((await browser.evaluate<string>('document.querySelector("#empty-state").textContent')).includes('目前没有已发布的模板'));
  assert.equal(await browser.evaluate('document.querySelector("#next-page").disabled'), true);
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
  await browser.tabTo('#prompt-query'); await browser.text('avatar'); await browser.key('Enter');
  await browser.wait(`document.querySelector('#applied-filters').textContent.includes('avatar')`);
  assert.equal(await browser.evaluate(visibleIds).then(items => items.length), 0);
  assert.equal(server.requests.filter(value => value.endsWith('.webp')).length, 0);
  assert.deepEqual(browser.errors, []);
});
