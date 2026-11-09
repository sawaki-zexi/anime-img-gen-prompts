import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import { catalogSchema } from '../src/lib/schema.ts';

export const projectRoot = path.resolve(import.meta.dirname, '..');
export const catalog = catalogSchema.parse(JSON.parse(await readFile(path.join(projectRoot, 'generated/catalog.json'), 'utf8')));
export const prompt = catalog.prompts.find(item => item.id === 'summer-anime-illustrator')!;
export const singleCatalog = { ...catalog, prompts: [prompt] };

export async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'anime-prompt-test-'));
  const contentDir = path.join(directory, 'content');
  const publicDir = path.join(directory, 'public');
  await cp(path.join(projectRoot, 'content'), contentDir, { recursive: true });
  await mkdir(publicDir);
  await cp(path.join(projectRoot, 'public/images'), path.join(publicDir, 'images'), { recursive: true });
  return {
    directory, contentDir, publicDir,
    async edit(transform: (data: Record<string, any>, body: string) => { data: Record<string, any>; body: string }, name = 'summer-anime-illustrator.md') {
      const filename = path.join(contentDir, 'prompts', name);
      const original = matter(await readFile(path.join(contentDir, 'prompts/summer-anime-illustrator.md'), 'utf8'));
      const result = transform(structuredClone(original.data), original.content.trim());
      await writeFile(filename, matter.stringify(result.body, result.data), 'utf8');
    },
    async cleanup() {
      const absolute = path.resolve(directory);
      if (path.dirname(absolute) !== path.resolve(tmpdir()) || !path.basename(absolute).startsWith('anime-prompt-test-')) throw new Error('Unexpected test cleanup path');
      await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
