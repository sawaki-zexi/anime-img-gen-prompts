import { catalogSchema, type Catalog } from '../lib/schema.ts';
import { contentDigest } from '../lib/revision.ts';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); }
  return value;
}

export async function validateSnapshot(value: unknown): Promise<Catalog> {
  const catalog = catalogSchema.parse(value);
  const { catalog_revision, ...payload } = catalog;
  if (await contentDigest(payload) !== catalog_revision) throw new Error('内容快照摘要不符');
  return freeze(catalog);
}

/** Maintenance-only seam. A fully checked candidate replaces one reference; failures retain the active snapshot. */
export async function createSnapshotStore(initial: unknown) {
  let active = await validateSnapshot(initial);
  const site = active.site_url;
  return {
    current: () => active,
    async activate(candidate: unknown) {
      const next = await validateSnapshot(candidate);
      if (next.site_url !== site) throw new Error('快照站点来源不同');
      active = next;
      return active.catalog_revision;
    },
  };
}
