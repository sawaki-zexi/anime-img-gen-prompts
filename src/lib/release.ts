import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const releasePresentation = z.object({
  catalog_revision: z.string(),
  mcp_url: z.url(),
  download_url: z.url(),
  archive_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  plugin_version: z.string(),
  marketplace_ref: z.string().regex(/^[a-zA-Z0-9_-]+$/).nullable(),
}).strict();

export async function readReleasePresentation(revision: string) {
  if (!process.env.RELEASE_PRESENTATION_FILE) return null;
  const value = releasePresentation.parse(JSON.parse(await readFile(process.env.RELEASE_PRESENTATION_FILE, 'utf8')));
  if (value.catalog_revision !== revision) throw new Error('安装入口与内容快照不一致');
  return value;
}
