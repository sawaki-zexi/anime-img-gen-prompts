import { z } from 'zod';

export const slugSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const variableName = z.string().regex(/^[a-z][a-z0-9_]*$/);
const unicodeString = (limit: number) => z.string().refine(value => [...value].length <= limit, `最多 ${limit} 个 Unicode 字符`);
const modelName = unicodeString(100).pipe(z.string().min(1)).refine(value => value.normalize('NFKC').trim().length > 0, '模型名称不能为空白');

export const variableSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean(),
  default: unicodeString(2000).optional(),
  options: z.array(z.string()).min(1).optional(),
  max_length: z.number().int().min(1).max(2000).default(2000),
}).strict();

export const sourceSchema = z.object({
  author: z.string().min(1),
  origin: z.string().min(1),
  text_license: z.string().min(1),
  image_license: z.string().min(1),
}).strict();

export const compatibilitySchema = z.object({
  model: z.string().min(1),
  status: z.enum(['verified', 'declared', 'unknown', 'incompatible']),
  note: z.string().min(1),
}).strict();

export const exampleSchema = z.object({
  id: slugSchema,
  image: z.string().min(1),
  thumbnail: z.string().min(1),
  alt: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  effective_prompt: z.string().min(1),
  variables: z.record(variableName, z.string()),
  template_version: z.string().min(1),
  generator: z.string().min(1),
  model: z.string().nullable(),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  created_at: z.iso.date().nullable(),
  provenance: z.string().min(1),
}).strict();

export const authoredPromptSchema = z.object({
  id: slugSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  language: z.enum(['zh', 'en']),
  status: z.enum(['draft', 'published', 'archived']),
  updated_at: z.iso.date(),
  template_version: z.string().min(1),
  use_cases: z.array(slugSchema).min(1),
  styles: z.array(slugSchema).min(1),
  keywords: z.array(z.string().min(1)).min(1),
  variables: z.record(variableName, variableSchema),
  model_compatibility: z.array(compatibilitySchema),
  conditions: z.array(z.string().min(1)),
  source: sourceSchema,
  examples: z.array(exampleSchema).default([]),
  related_ids: z.array(slugSchema).default([]),
  archive_note: z.string().min(1).optional(),
  negative_template: z.string().min(1).optional(),
}).strict();

export const promptSchema = authoredPromptSchema.extend({
  template: z.string().min(1),
  prompt_revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  url: z.url(),
});

const termSchema = z.object({ id: slugSchema, label: z.string().min(1), aliases: z.array(z.string().min(1)) }).strict();
export const taxonomySchema = z.object({ use_cases: z.array(termSchema), styles: z.array(termSchema), models: z.array(termSchema).default([]) }).strict();
export const archivedPromptSchema = z.object({
  id: slugSchema, title: z.string().min(1), status: z.literal('archived'),
  updated_at: z.iso.date(), url: z.url(), related_ids: z.array(slugSchema),
  archive_note: z.string().min(1).optional(),
}).strict();
export const catalogSchema = z.object({
  schema_version: z.literal('1'),
  catalog_revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  site_url: z.url(),
  base_path: z.string(),
  taxonomy: taxonomySchema,
  prompts: z.array(promptSchema),
  archives: z.array(archivedPromptSchema).default([]),
}).strict();

export type Prompt = z.infer<typeof promptSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type Taxonomy = z.infer<typeof taxonomySchema>;

export const searchInputSchema = z.object({
  query: unicodeString(256).default(''),
  use_cases: z.array(slugSchema).max(32).default([]),
  styles: z.array(slugSchema).max(32).default([]),
  model: modelName.optional(),
  verified_only: z.boolean().default(false),
  limit: z.number().int().min(1).max(20).default(5),
  cursor: z.string().max(8192).optional(),
}).strict();

export const getInputSchema = z.object({
  id: z.string().min(1).max(120),
  expected_revision: z.string().min(1).max(100).optional(),
  include_examples: z.boolean().default(false),
}).strict();

export const renderInputSchema = z.object({
  id: z.string().min(1).max(120),
  expected_revision: z.string().min(1).max(100),
  variables: z.record(variableName, unicodeString(2000)).refine(value => Object.keys(value).length <= 32, '单次变量最多 32 项'),
  model: modelName.optional(),
}).strict();

const errorCodeSchema = z.enum(['INVALID_INPUT', 'NOT_FOUND', 'REVISION_MISMATCH', 'MISSING_VARIABLES', 'INVALID_VARIABLES', 'INVALID_CURSOR', 'MODEL_INCOMPATIBLE']);
export const failureSchema = z.object({
  ok: z.literal(false),
  catalog_revision: z.string(),
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
    retryable: z.literal(false),
  }).strict(),
}).strict();
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const summarySchema = promptSchema.pick({
  id: true, prompt_revision: true, title: true, summary: true, use_cases: true,
  styles: true, language: true, model_compatibility: true, url: true,
}).extend({
  cover: exampleSchema.pick({ image: true, thumbnail: true, alt: true, width: true, height: true }),
  match_reasons: z.array(z.string()),
});

// Search data contains unordered body words, never a usable full template or defaults.
export const searchDocumentSchema = summarySchema.omit({ match_reasons: true }).extend({
  keywords: z.array(z.string()), body_terms: z.array(z.string()),
}).strict();
export const searchCatalogSchema = catalogSchema.omit({ prompts: true }).extend({ prompts: z.array(searchDocumentSchema) }).strict();
export const detailDocumentSchema = z.object({ catalog_revision: z.string(), prompt: promptSchema }).strict();
export type SearchCatalog = z.infer<typeof searchCatalogSchema>;
export type SearchDocument = z.infer<typeof searchDocumentSchema>;
export type SearchInput = z.infer<typeof searchInputSchema>;

const searchDataSchema = z.object({
  items: z.array(summarySchema),
  facets: taxonomySchema,
  filters: searchInputSchema.omit({ cursor: true }),
  next_cursor: z.string().nullable(),
}).strict();

export const renderDataSchema = z.object({
  id: z.string(), prompt_revision: z.string(), url: z.url(),
  prompt: z.string(), negative_prompt: z.string().optional(),
  variables: z.record(z.string(), z.string()),
  model_compatibility: z.array(compatibilitySchema),
  warnings: z.array(z.string()), source: sourceSchema,
}).strict();

const resultSchema = <T extends z.ZodType>(data: T) => z.union([
  z.object({ ok: z.literal(true), catalog_revision: z.string(), data }).strict(),
  failureSchema,
]);
export const searchResultSchema = resultSchema(searchDataSchema);
export const getResultSchema = resultSchema(promptSchema);
export const renderResultSchema = resultSchema(renderDataSchema);
export type SearchResult = z.infer<typeof searchResultSchema>;
export type GetResult = z.infer<typeof getResultSchema>;
export type RenderResult = z.infer<typeof renderResultSchema>;
