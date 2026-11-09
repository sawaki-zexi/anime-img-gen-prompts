import type { SearchInput } from './schema.ts';

export function readSearchParams(params: URLSearchParams): Record<string, unknown> {
  const verified = params.get('verified');
  return {
    query: params.get('q') ?? '', use_cases: params.getAll('use_case'), styles: params.getAll('style'),
    ...(params.has('model') ? { model: params.get('model') } : {}),
    verified_only: verified === null || verified === '0' || verified === 'false' ? false : verified === '1' || verified === 'true' ? true : verified,
    ...(params.has('limit') ? { limit: Number(params.get('limit')) } : {}),
    ...(params.has('cursor') ? { cursor: params.get('cursor') } : {}),
  };
}

export function writeSearchParams(input: SearchInput): URLSearchParams {
  const params = new URLSearchParams();
  if (input.query) params.set('q', input.query);
  for (const id of [...new Set(input.use_cases)].sort()) params.append('use_case', id);
  for (const id of [...new Set(input.styles)].sort()) params.append('style', id);
  if (input.model) params.set('model', input.model);
  if (input.verified_only) params.set('verified', '1');
  if (input.limit !== 5) params.set('limit', String(input.limit));
  if (input.cursor) params.set('cursor', input.cursor);
  return params;
}
