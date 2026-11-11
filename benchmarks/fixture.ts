import type { Catalog } from '../src/lib/schema.ts';
import { contentDigest } from '../src/lib/revision.ts';

/** Isolated load-test data. Never passed to the public content/release builder. */
export async function syntheticCatalog(source: Catalog, count = 1000): Promise<Catalog> {
  if (!Number.isInteger(count) || count < 1 || count > 1000 || !source.prompts.length) throw new Error('Invalid synthetic fixture size');
  const prompts = await Promise.all(Array.from({ length: count }, async (_, index) => {
    const original = source.prompts[index % source.prompts.length]!;
    const id = `synthetic-fixture-${String(index).padStart(4, '0')}`;
    return {
      ...structuredClone(original), id, title: `SYNTHETIC FIXTURE ${index}`, summary: 'Isolated synthetic load-test fixture; never a published example.',
      keywords: ['fixture', ...original.keywords], related_ids: [], url: new URL(`${source.base_path}prompts/${id}/`, source.site_url).href,
      prompt_revision: await contentDigest({ fixture: id, original_revision: original.prompt_revision }),
      examples: original.examples.map(example => ({ ...example, image: new URL(`${source.base_path}images/benchmark/${id}.webp`, source.site_url).href, thumbnail: new URL(`${source.base_path}images/benchmark/${id}-thumb.webp`, source.site_url).href, provenance: `SYNTHETIC FIXTURE reuses ${original.id}/${example.id} pixels; no new image was generated.` })),
    };
  }));
  const { catalog_revision: _, ...payload } = { ...source, prompts };
  return { ...payload, catalog_revision: await contentDigest(payload) };
}
