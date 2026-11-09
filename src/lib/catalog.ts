import {
  getInputSchema, renderInputSchema, searchInputSchema,
  type Catalog, type ErrorCode, type GetResult, type Prompt, type RenderResult, type SearchCatalog, type SearchResult, type Taxonomy,
} from './schema.ts';

export const placeholderPattern = /\{([a-z][a-z0-9_]*)\}/g;
export const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en-US').trim();

function failure(catalog: Pick<Catalog, 'catalog_revision'>, code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
  return { ok: false as const, catalog_revision: catalog.catalog_revision, error: { code, message, details, retryable: false as const } };
}

function findPublished(catalog: Catalog, id: string) {
  return catalog.prompts.find(prompt => prompt.id === id && prompt.status === 'published');
}

function canonicalModel(taxonomy: Taxonomy, model: string) {
  return taxonomy.models.find(term => [term.id, term.label, ...term.aliases].some(value => normalize(value) === normalize(model)))?.id ?? normalize(model);
}

function compatibility(prompt: Pick<Prompt, 'model_compatibility'>, taxonomy: Taxonomy, model?: string) {
  return model ? prompt.model_compatibility.find(item => canonicalModel(taxonomy, item.model) === canonicalModel(taxonomy, model)) : undefined;
}

export function getPrompt(catalog: Catalog, input: unknown): GetResult {
  const parsed = getInputSchema.safeParse(input);
  if (!parsed.success) return failure(catalog, 'INVALID_INPUT', '请检查读取参数。', { issues: parsed.error.issues });
  const prompt = findPublished(catalog, parsed.data.id);
  if (!prompt) return failure(catalog, 'NOT_FOUND', '未找到可公开读取的提示词。', { id: parsed.data.id });
  if (parsed.data.expected_revision && parsed.data.expected_revision !== prompt.prompt_revision) {
    return failure(catalog, 'REVISION_MISMATCH', '提示词已更新，请重新读取当前修订。', { id: prompt.id, current_revision: prompt.prompt_revision });
  }
  return { ok: true, catalog_revision: catalog.catalog_revision, data: { ...prompt, examples: parsed.data.include_examples ? prompt.examples.slice(0, 3) : [] } };
}

export function renderPrompt(catalog: Catalog, input: unknown): RenderResult {
  const parsed = renderInputSchema.safeParse(input);
  if (!parsed.success) return failure(catalog, 'INVALID_INPUT', '请检查渲染参数和长度限制。', { issues: parsed.error.issues });
  const { id, expected_revision, variables, model } = parsed.data;
  const found = getPrompt(catalog, { id, expected_revision });
  if (!found.ok) return found;
  const prompt = found.data;
  const modelInfo = compatibility(prompt, catalog.taxonomy, model);
  if (modelInfo?.status === 'incompatible') return failure(catalog, 'MODEL_INCOMPATIBLE', modelInfo.note, { model });

  const unknown = Object.keys(variables).filter(key => !Object.hasOwn(prompt.variables, key));
  if (unknown.length) return failure(catalog, 'INVALID_VARIABLES', '存在模板未声明的变量。', { unknown });
  const missing: string[] = [];
  const invalid: Record<string, string> = {};
  const resolved: Record<string, string> = {};
  for (const [name, spec] of Object.entries(prompt.variables)) {
    const value = Object.hasOwn(variables, name) ? variables[name]! : spec.default ?? '';
    if (spec.required && !value.trim()) missing.push(name);
    if ([...value].length > spec.max_length) invalid[name] = `最多 ${spec.max_length} 个 Unicode 字符`;
    if (spec.options && value !== '' && !spec.options.includes(value)) invalid[name] = '不在可选值中';
    resolved[name] = value;
  }
  if (missing.length) return failure(catalog, 'MISSING_VARIABLES', '请填写必填变量。', { missing, ...(Object.keys(invalid).length ? { invalid } : {}) });
  if (Object.keys(invalid).length) return failure(catalog, 'INVALID_VARIABLES', '部分变量取值不合法。', { invalid });
  // A single replace pass intentionally preserves any braces inside user values.
  const fill = (text: string) => text.replace(placeholderPattern, (_whole, name: string) => resolved[name] ?? '');
  const warnings = modelInfo?.status === 'verified' ? [] : [modelInfo?.note ?? '尚未验证此模板对具体模型的兼容性；示例仅记录已知生成条件。'];
  return {
    ok: true, catalog_revision: catalog.catalog_revision,
    data: {
      id: prompt.id, prompt_revision: prompt.prompt_revision, url: prompt.url,
      prompt: fill(prompt.template),
      ...(prompt.negative_template ? { negative_prompt: fill(prompt.negative_template) } : {}),
      variables: resolved, model_compatibility: prompt.model_compatibility, warnings, source: prompt.source,
    },
  };
}

function encodeCursor(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeCursor(value: string): unknown {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))));
}

export function createSearchCatalog(catalog: Catalog): SearchCatalog {
  return {
    schema_version: catalog.schema_version, catalog_revision: catalog.catalog_revision,
    site_url: catalog.site_url, base_path: catalog.base_path, taxonomy: catalog.taxonomy, archives: catalog.archives,
    prompts: catalog.prompts.filter(prompt => prompt.status === 'published').map(prompt => {
      const cover = prompt.examples[0]!;
      return {
        id: prompt.id, prompt_revision: prompt.prompt_revision, title: prompt.title, summary: prompt.summary,
        language: prompt.language, use_cases: prompt.use_cases, styles: prompt.styles,
        model_compatibility: prompt.model_compatibility, url: prompt.url, keywords: prompt.keywords,
        cover: { image: cover.image, thumbnail: cover.thumbnail, alt: cover.alt, width: cover.width, height: cover.height },
        body_terms: [...new Set(normalize(prompt.template).match(/[\p{L}\p{N}_]+/gu) ?? [])].sort(),
      };
    }),
  };
}

export function searchPrompts(source: Catalog | SearchCatalog, input: unknown = {}): SearchResult {
  const catalog = source.prompts.some(prompt => 'template' in prompt) ? createSearchCatalog(source as Catalog) : source as SearchCatalog;
  const parsed = searchInputSchema.safeParse(input);
  if (!parsed.success) return failure(catalog, 'INVALID_INPUT', '请检查搜索参数和长度限制。', { issues: parsed.error.issues });
  const { cursor, ...filters } = parsed.data;
  filters.use_cases = [...new Set(filters.use_cases)].sort();
  filters.styles = [...new Set(filters.styles)].sort();
  if (filters.model) filters.model = canonicalModel(catalog.taxonomy, filters.model);
  if (filters.verified_only && !filters.model) return failure(catalog, 'INVALID_INPUT', '仅已验证检索需要指定模型。', { field: 'model' });
  for (const field of ['use_cases', 'styles'] as const) {
    const allowed = catalog.taxonomy[field].map(term => term.id);
    const unknown = filters[field].filter(id => !allowed.includes(id));
    if (unknown.length) return failure(catalog, 'INVALID_INPUT', '筛选项不在当前词表中。', { field, unknown, allowed });
  }
  const query = normalize(filters.query);
  const queryTerms = query.match(/[\p{L}\p{N}_]+/gu) ?? (query ? [query] : []);
  const signature = JSON.stringify({ revision: catalog.catalog_revision, ...filters, query, use_cases: [...filters.use_cases].sort(), styles: [...filters.styles].sort() });
  let offset = 0;
  if (cursor) {
    try {
      const decoded = decodeCursor(cursor) as { signature?: unknown; offset?: unknown };
      if (decoded.signature !== signature || !Number.isSafeInteger(decoded.offset) || (decoded.offset as number) < 0) throw new Error('cursor');
      offset = decoded.offset as number;
    } catch {
      return failure(catalog, 'INVALID_CURSOR', '游标不属于当前查询或内容版本，请从第一页检索。');
    }
  }
  const matches = catalog.prompts.flatMap(prompt => {
    if (filters.use_cases.length && !filters.use_cases.some(id => prompt.use_cases.includes(id))) return [];
    if (filters.styles.length && !filters.styles.some(id => prompt.styles.includes(id))) return [];
    const modelInfo = compatibility(prompt, catalog.taxonomy, filters.model);
    if (modelInfo?.status === 'incompatible' || (filters.verified_only && modelInfo?.status !== 'verified')) return [];
    const terms = [
      ...catalog.taxonomy.use_cases.filter(term => prompt.use_cases.includes(term.id)),
      ...catalog.taxonomy.styles.filter(term => prompt.styles.includes(term.id)),
      ...catalog.taxonomy.models.filter(term => prompt.model_compatibility.some(item => item.model === term.id && item.status !== 'incompatible')),
    ];
    const categories = terms.flatMap(term => [term.id, term.label, ...term.aliases]).map(normalize);
    const names = [prompt.title, ...prompt.keywords].map(normalize);
    const summary = normalize(prompt.summary);
    let score = 0;
    const reasons = new Set<string>();
    for (const term of queryTerms) {
      if (categories.some(value => value.includes(term))) { score += 8; reasons.add('用途、画风或模型词表匹配'); }
      else if (names.some(value => value.includes(term))) { score += 4; reasons.add('名称、关键词或简介匹配'); }
      else if (summary.includes(term)) { score += 2; reasons.add('名称、关键词或简介匹配'); }
      else if (prompt.body_terms.some(value => value.includes(term))) { score += 1; reasons.add('提示词正文关键词匹配'); }
      else return [];
    }
    return [{ prompt, score, reasons: [...reasons] }];
  }).sort((a, b) => b.score - a.score || a.prompt.id.localeCompare(b.prompt.id, 'en'));
  if (offset > matches.length) return failure(catalog, 'INVALID_CURSOR', '游标超出结果范围，请从第一页检索。');
  const items = matches.slice(offset, offset + filters.limit).map(({ prompt, reasons }) => {
    return {
      id: prompt.id, prompt_revision: prompt.prompt_revision, title: prompt.title, summary: prompt.summary,
      language: prompt.language, use_cases: prompt.use_cases, styles: prompt.styles, model_compatibility: prompt.model_compatibility, url: prompt.url,
      cover: prompt.cover,
      match_reasons: query ? reasons : ['公开条目'],
    };
  });
  const nextOffset = offset + items.length;
  return {
    ok: true, catalog_revision: catalog.catalog_revision,
    data: { items, facets: catalog.taxonomy, filters, next_cursor: nextOffset < matches.length ? encodeCursor({ signature, offset: nextOffset }) : null },
  };
}
