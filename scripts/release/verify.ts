import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validateSnapshot } from '../../src/server/snapshots.ts';
import { sha256 } from '../plugin/package.ts';

export async function verifyRelease(directory: string) {
  const root = path.resolve(directory);
  const bytes = await readFile(path.join(root, 'release-manifest.json'));
  const manifest = JSON.parse(bytes.toString());
  const receipt = JSON.parse(await readFile(path.join(root, 'build-receipt.json'), 'utf8'));
  const snapshot = await validateSnapshot(JSON.parse(await readFile(path.join(root, 'snapshot/catalog.json'), 'utf8')));
  const worker = await readFile(path.join(root, 'dist/server/index.js'));
  const hosting = JSON.parse(await readFile(path.join(root, 'dist/.openai/hosting.json'), 'utf8'));
  if (sha256(worker) !== receipt.worker_sha256 || sha256(bytes) !== receipt.manifest_sha256) throw new Error('发布产物摘要不符');
  if (manifest.catalog_revision !== snapshot.catalog_revision || receipt.catalog_revision !== snapshot.catalog_revision || manifest.prompt_count !== snapshot.prompts.length || manifest.gallery_url !== `${snapshot.site_url}${snapshot.base_path}`) throw new Error('发布产物内容快照不一致');
  if (hosting.project_id !== manifest.project_id || hosting.static || hosting.capabilities) throw new Error('发布产物 Site 配置不一致');
  return { passed: true, directory: root, stage: manifest.stage, catalog_revision: snapshot.catalog_revision, worker_sha256: receipt.worker_sha256, project_id: manifest.project_id, deployment: 'not checked; offline artifact verification only' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { dir: { type: 'string' } } });
  if (!values.dir) throw new Error('用法: npm run release:verify -- --dir <保留的不可变发布目录>');
  console.log(JSON.stringify(await verifyRelease(values.dir), null, 2));
}
