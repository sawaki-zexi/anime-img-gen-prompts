import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { buildCatalog } from '../../src/content/build.ts';
import { browserTestResources } from '../browser-resources.ts';

const mode = process.env.BROWSER_RESOURCE_FAILURE;

test(`intentional ${mode} failure`, async t => {
  const resources = browserTestResources(t);
  const files = await resources.fixture();
  console.log(`RESOURCE_REPORT ${JSON.stringify({ directory: files.directory })}`);
  if (mode === 'file') {
    await readFile(path.join(files.directory, 'intentionally-missing-file'));
    assert.fail('The missing file must fail');
  }
  if (mode === 'build') {
    await files.edit((data, body) => ({ data: { ...data, use_cases: ['fixture-missing-taxonomy'] }, body }));
    await buildCatalog(files);
    assert.fail('Invalid content must fail its build');
  }
  await writeFile(path.join(files.directory, 'index.html'), 'live resource fixture');
  const server = await resources.serve(files.directory);
  const response = await fetch(server.origin);
  assert.equal(await response.text(), 'live resource fixture');
  console.log(`RESOURCE_REPORT ${JSON.stringify({ directory: files.directory, origin: server.origin, live_status: response.status })}`);
  if (mode === 'cleanup') {
    resources.defer(() => { throw new Error('SIMULATED_CLEANUP_FAILURE'); });
    return;
  }
  assert.equal(mode, 'browser');
  await resources.browser(path.join(files.directory, 'chrome'), async () => {
    throw new Error('SIMULATED_BROWSER_START_FAILURE');
  });
});
