import { animate } from 'motion/mini';
import { searchPrompts } from '../lib/catalog.ts';
import { copyField } from '../lib/clipboard.ts';
import { detailDocumentSchema, searchCatalogSchema, searchInputSchema, type SearchInput, type SearchResult } from '../lib/schema.ts';
import { readSearchParams, writeSearchParams } from '../lib/search-url.ts';

const catalog = searchCatalogSchema.parse(JSON.parse(document.querySelector('#catalog-data')!.textContent!));
const form = document.querySelector<HTMLFormElement>('#search-form')!;
const grid = document.querySelector<HTMLElement>('#prompt-grid')!;
const error = document.querySelector<HTMLElement>('#search-error')!;
const next = document.querySelector<HTMLButtonElement>('#next-page')!;
const first = document.querySelector<HTMLButtonElement>('#first-page')!;
const template = document.querySelector<HTMLTemplateElement>('#prompt-card-template')!;
const query = form.querySelector<HTMLInputElement>('[name=q]')!;
const model = form.querySelector<HTMLInputElement>('[name=model]')!;
const verified = form.querySelector<HTMLInputElement>('[name=verified]')!;
const limit = form.querySelector<HTMLSelectElement>('[name=limit]')!;
const advanced = form.querySelector<HTMLDetailsElement>('#advanced-filters')!;
const applied = document.querySelector<HTMLElement>('#applied-filters')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear-search')!;
const emptyReset = document.querySelector<HTMLButtonElement>('#empty-reset')!;
const pagination = document.querySelector<HTMLElement>('.pagination')!;
let current: Record<string, unknown> = {};
let nextCursor: string | null = null;
const details = new Map<string, Promise<string>>();
const local = (url: string) => new URL(url).pathname;
const label = (id: string) => [...catalog.taxonomy.use_cases, ...catalog.taxonomy.styles].find(term => term.id === id)?.label ?? id;

function conditions(input: Record<string, unknown>) {
  const parts = [typeof input.query === 'string' && input.query.trim() ? `关键词「${input.query}」` : '', ...(['use_cases', 'styles'] as const).flatMap(key => Array.isArray(input[key]) ? input[key].map(id => label(String(id))) : []), input.model ? `模型 ${input.model}` : '', input.verified_only ? '仅已验证' : '', input.limit && Number(input.limit) !== 5 ? `每页 ${input.limit} 条` : ''].filter(Boolean);
  return parts.join(' · ');
}

function showConditions(input: Record<string, unknown>) {
  const summary = conditions(input);
  applied.textContent = summary; applied.hidden = !summary;
  clearButton.hidden = !summary; emptyReset.hidden = !summary;
}

type Item = Extract<SearchResult, { ok: true }>['data']['items'][number];
function card(item: Item) {
  const article = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  article.dataset.promptId = item.id; article.dataset.promptRevision = item.prompt_revision;
  article.querySelectorAll<HTMLAnchorElement>('a').forEach(link => { link.href = local(item.url); });
  article.querySelector('.card-art-link')!.setAttribute('aria-label', `查看${item.title}的提示词`);
  const image = article.querySelector('img')!;
  image.src = local(item.cover.thumbnail); image.alt = item.cover.alt; image.width = item.cover.width; image.height = item.cover.height;
  article.querySelector('h3 a')!.textContent = item.title;
  const tags = article.querySelector('.tag-row')!;
  tags.replaceChildren(...[...item.use_cases, ...item.styles].map(id => {
    const badge = document.createElement('span'); badge.className = `badge ${item.styles.includes(id) ? 'style-badge' : 'badge-soft'}`; badge.textContent = label(id); return badge;
  }));
  const modelInfo = item.model_compatibility.find(info => info.model === current.model);
  const modelStatus = { verified: '已验证', declared: '作者声明', unknown: '未知', incompatible: '不兼容' };
  const modelNote = article.querySelector<HTMLElement>('.model-note')!;
  modelNote.hidden = !current.model;
  modelNote.textContent = current.model ? `${current.model} · ${modelInfo ? modelStatus[modelInfo.status] : '兼容性未知'}` : '';
  article.querySelector('button')!.setAttribute('aria-label', `复制${item.title}的模板原文`);
  article.querySelector('.copy-status')!.textContent = '';
  article.querySelector<HTMLElement>('.card-copy-fallback')!.hidden = true;
  return article;
}

function search(input: Record<string, unknown>, updateUrl = true, focus = false) {
  const found = searchPrompts(catalog, input);
  current = input;
  error.hidden = found.ok;
  showConditions(input);
  if (!found.ok) {
    grid.replaceChildren(); next.hidden = true; nextCursor = null;
    document.querySelector<HTMLElement>('#empty-state')!.hidden = true;
    document.querySelector('#result-count')!.textContent = '条件需要调整';
    first.hidden = !input.cursor;
    pagination.hidden = first.hidden;
    const issues = found.error.details.issues as { message: string }[] | undefined;
    const unknown = found.error.details.unknown as string[] | undefined;
    error.textContent = [found.error.message, ...(issues?.map(issue => issue.message) ?? []), ...(unknown?.map(id => `未知筛选项：${id}`) ?? [])].join(' ');
    const parsed = searchInputSchema.safeParse(input);
    if (updateUrl && parsed.success) updateLocation(parsed.data);
    return;
  }
  current = { ...found.data.filters, ...(input.cursor ? { cursor: input.cursor } : {}) };
  showConditions(current);
  grid.replaceChildren(...found.data.items.map(card));
  document.querySelector<HTMLElement>('#empty-state')!.hidden = found.data.items.length > 0;
  document.querySelector('#result-count')!.textContent = `${found.data.items.length} 条`;
  nextCursor = found.data.next_cursor; next.hidden = !nextCursor; first.hidden = !input.cursor;
  pagination.hidden = next.hidden && first.hidden;
  if (updateUrl) {
    updateLocation(current as SearchInput);
  }
  if (focus) document.querySelector<HTMLElement>('#gallery-title')!.focus({ preventScroll: false });
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) animate(grid, { opacity: [0.5, 1] }, { duration: 0.18 });
}

function updateLocation(input: SearchInput) {
  const url = new URL(location.href); url.search = writeSearchParams(input).toString();
  if (url.href !== location.href) history.pushState({}, '', url);
}

function formInput() {
  return { query: query.value, use_cases: [...form.querySelectorAll<HTMLInputElement>('[name=use_case]:checked')].map(field => field.value), styles: [...form.querySelectorAll<HTMLInputElement>('[name=style]:checked')].map(field => field.value), ...(model.value.trim() ? { model: model.value.trim() } : {}), verified_only: verified.checked, limit: Number(limit.value) };
}
function restore() {
  const input = readSearchParams(new URLSearchParams(location.search));
  query.value = String(input.query); model.value = String(input.model ?? ''); verified.checked = input.verified_only === true;
  const pageSize = String(input.limit ?? 5);
  if (!limit.querySelector(`option[value="${CSS.escape(pageSize)}"]`) && /^\d+$/.test(pageSize) && Number(pageSize) >= 1 && Number(pageSize) <= 20) {
    const option = new Option(`${pageSize} 条`, pageSize); limit.add(option);
  }
  limit.value = pageSize;
  advanced.open = !!input.model || input.verified_only === true || pageSize !== '5';
  for (const key of ['use_case', 'style'] as const) {
    const values = input[key === 'use_case' ? 'use_cases' : 'styles'] as string[];
    form.querySelectorAll<HTMLInputElement>(`[name=${key}]`).forEach(field => { field.checked = values.includes(field.value); });
  }
  search(input, false);
}
function clear() { form.reset(); advanced.open = false; search(formInput()); }
form.addEventListener('submit', event => { event.preventDefault(); search(formInput()); });
form.addEventListener('change', () => search(formInput()));
clearButton.addEventListener('click', clear);
emptyReset.addEventListener('click', clear);
next.addEventListener('click', () => { if (nextCursor) search({ ...current, cursor: nextCursor }, true, true); });
first.addEventListener('click', () => { const { cursor: _cursor, ...input } = current; search(input, true, true); });
window.addEventListener('popstate', restore);
grid.addEventListener('click', async event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('.card-copy');
  if (!button) return;
  const article = button.closest<HTMLElement>('[data-prompt-id]')!;
  const id = article.dataset.promptId!;
  const status = article.querySelector<HTMLElement>('.copy-status')!;
  const fallback = article.querySelector<HTMLElement>('.card-copy-fallback')!;
  const field = fallback.querySelector('textarea')!;
  button.disabled = true; status.textContent = '正在读取模板…';
  try {
    if (!details.has(id)) details.set(id, fetch(`${catalog.base_path}data/prompts/${encodeURIComponent(id)}.json`).then(async response => {
      if (!response.ok) throw new Error('读取失败，请打开详情后重试。');
      const detail = detailDocumentSchema.parse(await response.json());
      if (detail.catalog_revision !== catalog.catalog_revision || detail.prompt.prompt_revision !== article.dataset.promptRevision) throw new Error('内容已更新，请刷新画廊后复制。');
      return detail.prompt.template;
    }));
    field.value = await details.get(id)!;
    fallback.hidden = false;
    await copyField(field, status);
    if (document.activeElement !== field) fallback.hidden = true;
  } catch (reason) { details.delete(id); status.textContent = reason instanceof Error ? reason.message : '读取失败，请打开详情。'; }
  finally { button.disabled = false; }
});
restore();
