import type { TestContext } from 'node:test';
import { Browser, serve } from './browser-helper.ts';
import { fixture } from './helpers.ts';

export function browserTestResources(t: Pick<TestContext, 'after'>) {
  const cleanup = new AsyncDisposableStack();
  // Register before any acquisition. LIFO disposal closes browser/server before files,
  // continues after a cleanup fails, and retains each failure in SuppressedError.
  t.after(() => cleanup.disposeAsync());
  return {
    fixture: () => fixture(cleanup),
    async serve(directory: string, aliases?: Map<string, string>) {
      return cleanup.adopt(await serve(directory, aliases), server => server.close());
    },
    async browser(profile: string, launch: typeof Browser.launch = Browser.launch) {
      return cleanup.adopt(await launch(profile), browser => browser.close());
    },
    defer: (callback: () => void | PromiseLike<void>) => cleanup.defer(callback),
  };
}
