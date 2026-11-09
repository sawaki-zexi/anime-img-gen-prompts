import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { checkLockfile } from '../scripts/check-lockfile.ts';
import { projectRoot } from './helpers.ts';

test('the lockfile retains complete cross-platform dependencies and detects the Linux optional-package regression', async () => {
  const lock = JSON.parse(await readFile(path.join(projectRoot, 'package-lock.json'), 'utf8'));
  assert.deepEqual(checkLockfile(lock), []);
  const location = 'node_modules/@astrojs/compiler-binding/node_modules/@astrojs/compiler-binding-linux-x64-gnu';
  lock.packages[location] = { dev: true, optional: true };
  assert.deepEqual(checkLockfile(lock), [`${location}: missing version`, `${location}: missing resolved`, `${location}: missing integrity`]);
});

test('workspace links and bundled packages do not require registry tarball metadata', () => {
  assert.deepEqual(checkLockfile({ lockfileVersion: 3, packages: {
    '': {}, 'packages/shared': {}, 'node_modules/shared': { link: true, resolved: 'packages/shared' },
    'node_modules/bundled-parent/node_modules/bundled-child': { inBundle: true, version: '1.0.0' },
  } }), []);
});
