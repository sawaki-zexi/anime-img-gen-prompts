import assert from 'node:assert/strict';
import { execFile, type ExecFileException } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { projectRoot } from './helpers.ts';

const run = promisify(execFile);
const failures = [
  ['file', 'intentionally-missing-file'],
  ['build', 'fixture-missing-taxonomy'],
  ['browser', 'SIMULATED_BROWSER_START_FAILURE'],
  ['cleanup', 'SIMULATED_CLEANUP_FAILURE'],
] as const;

for (const [mode, expectedFailure] of failures) {
  test(`${mode} failure preserves its error, releases real resources and lets the test process exit`, { timeout: 20000 }, async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, BROWSER_RESOURCE_FAILURE: mode };
    // Run the fixture as its own native node:test process, without inherited runner IPC.
    delete env.NODE_TEST_CONTEXT;
    let failure: (ExecFileException & { stdout: string; stderr: string }) | undefined;
    try {
      await run(process.execPath, ['--import', 'tsx', path.join(projectRoot, 'tests/fixtures/browser-resource-failure.ts')], { cwd: projectRoot, env, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 });
    } catch (error) { failure = error as typeof failure; }
    assert.ok(failure, 'The initialization/cleanup failure must reach the test reporter');
    const output = `${failure.stdout}\n${failure.stderr}`;
    assert.equal(failure.killed, false, output);
    assert.equal(failure.code, 1, output);
    assert.ok(output.includes(expectedFailure), output);
    const reports = [...output.matchAll(/RESOURCE_REPORT (\{[^\r\n]*\})/g)].map(match => JSON.parse(match[1]!) as { directory: string; origin?: string; live_status?: number });
    assert.ok(reports.length > 0, output);
    for (const directory of new Set(reports.map(report => report.directory))) await assert.rejects(stat(directory), { code: 'ENOENT' });
    if (mode === 'browser' || mode === 'cleanup') {
      const live = reports.find(report => report.origin);
      assert.equal(live?.live_status, 200, output);
      await assert.rejects(fetch(live!.origin!, { signal: AbortSignal.timeout(2000) }), error => error instanceof TypeError && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ECONNREFUSED');
    }
  });
}
