import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import { catalogSchema } from '../src/lib/schema.ts';
import { fixtureCatalog, fixtureImages, fixtureRecords, fixtureTaxonomy } from './fixtures/catalog-data.ts';
export { fixtureImages } from './fixtures/catalog-data.ts';

export const projectRoot = path.resolve(import.meta.dirname, '..');
export const productionCatalog = catalogSchema.parse(JSON.parse(await readFile(path.join(projectRoot, 'generated/catalog.json'), 'utf8')));
export const catalog = fixtureCatalog;
export const prompt = catalog.prompts.find(item => item.id === 'fixture-wallpaper')!;
export const singleCatalog = { ...catalog, prompts: [prompt] };

export async function fixture(resources?: AsyncDisposableStack) {
  const directory = await mkdtemp(path.join(tmpdir(), 'anime-prompt-test-'));
  const contentDir = path.join(directory, 'content'), publicDir = path.join(directory, 'public');
  const cleanup = async () => {
    const absolute = path.resolve(directory);
    if (path.dirname(absolute) !== path.resolve(tmpdir()) || !path.basename(absolute).startsWith('anime-prompt-test-')) throw new Error('Unexpected test cleanup path');
    await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  let registered = false;
  try {
    if (resources) { resources.defer(cleanup); registered = true; }
    await mkdir(path.join(contentDir, 'prompts'), { recursive: true }); await mkdir(path.join(publicDir, 'images'), { recursive: true });
    await writeFile(path.join(contentDir, 'taxonomy.json'), JSON.stringify(fixtureTaxonomy));
    for (const { authored, template } of fixtureRecords) await writeFile(path.join(contentDir, 'prompts', `${authored.id}.md`), matter.stringify(template, authored));
    for (const [filename, bytes] of fixtureImages) await writeFile(path.join(publicDir, filename), bytes);
  } catch (error) {
    if (!registered) { try { await cleanup(); } catch (cleanupError) { throw new SuppressedError(cleanupError, error, 'Fixture creation and cleanup both failed'); } }
    throw error;
  }
  return {
    directory, contentDir, publicDir,
    async edit(transform: (data: Record<string, any>, body: string) => { data: Record<string, any>; body: string }, name = 'fixture-wallpaper.md') {
      const filename = path.join(contentDir, 'prompts', name);
      const original = matter(await readFile(path.join(contentDir, 'prompts/fixture-wallpaper.md'), 'utf8'));
      const result = transform(structuredClone(original.data), original.content.trim());
      await writeFile(filename, matter.stringify(result.body, result.data), 'utf8');
    }, cleanup,
  };
}
