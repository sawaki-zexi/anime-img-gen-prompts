export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function contentDigest(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return `sha256:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
