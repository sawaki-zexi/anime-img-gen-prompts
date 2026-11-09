import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:http';
import path from 'node:path';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type Pending = { resolve: (value: any) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> };

export async function serve(directory: string) {
  const requests: string[] = [];
  const root = path.resolve(directory);
  const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url!, 'http://127.0.0.1').pathname);
      requests.push(pathname);
      const filename = path.resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
      if (path.relative(root, filename).startsWith('..') || path.isAbsolute(path.relative(root, filename))) throw new Error('Outside fixture');
      const bytes = await readFile(filename);
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] ?? 'application/octet-stream' });
      response.end(bytes);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { origin: `http://127.0.0.1:${address.port}`, requests, close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }) };
}

export async function runProcess(command: string, args: string[], cwd: string) {
  const child = spawn(command, args, { cwd, windowsHide: true, timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  assert.equal(code, 0, output);
}

export class Browser {
  private sequence = 0;
  private pending = new Map<number, Pending>();
  private session = '';
  private socket!: WebSocket;
  private process!: ChildProcess;
  readonly errors: string[] = [];

  static async launch(profile: string) {
    const browser = new Browser();
    const executable = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(value => value && existsSync(value));
    assert.ok(executable, 'Install Chrome/Chromium or set CHROME_BIN to run browser acceptance checks.');
    browser.process = spawn(executable, ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    try {
      const portFile = path.join(profile, 'DevToolsActivePort');
      for (let index = 0; index < 100 && !existsSync(portFile); index++) await pause(100);
      const port = (await readFile(portFile, 'utf8')).split('\n')[0];
      const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() as { webSocketDebuggerUrl: string };
      browser.socket = new WebSocket(info.webSocketDebuggerUrl);
      await new Promise<void>((resolve, reject) => { browser.socket.addEventListener('open', () => resolve(), { once: true }); browser.socket.addEventListener('error', reject, { once: true }); });
      browser.socket.addEventListener('message', event => {
        const message = JSON.parse(String(event.data));
        if (message.id) {
          const pending = browser.pending.get(message.id); if (!pending) return;
          browser.pending.delete(message.id); clearTimeout(pending.timer);
          if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
        }
        if (message.method === 'Runtime.exceptionThrown') browser.errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      });
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' }, false);
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true }, false);
      browser.session = sessionId;
      await browser.send('Page.enable'); await browser.send('Runtime.enable'); await browser.send('Network.enable');
      await browser.send('Page.bringToFront');
      await browser.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await browser.send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
      return browser;
    } catch (error) { await browser.close(); throw error; }
  }

  send(method: string, params: Record<string, unknown> = {}, session = true): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Browser timeout: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(session && this.session ? { sessionId: this.session } : {}) }));
    });
  }
  async evaluate<T = any>(expression: string): Promise<T> {
    const value = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
    return value.result.value;
  }
  async wait(expression: string) {
    for (let index = 0; index < 120; index++) {
      try { if (await this.evaluate(expression)) return; } catch { /* Navigation can replace the execution context. */ }
      await pause(50);
    }
    const state = await this.evaluate(`({ url: location.href, focus: document.activeElement?.id, controls: [...document.querySelectorAll('#variables-form input, #variables-form textarea, #variables-form select')].map(item => [item.id, item.value]), error: document.querySelector('#render-error')?.textContent })`);
    throw new Error(`Browser condition did not become true: ${expression}\n${JSON.stringify(state)}`);
  }
  async navigate(url: string, ready: string) { await this.send('Page.navigate', { url }); await this.wait(`document.readyState !== 'loading' && (${ready})`); }
  async viewport(width: number, mobile = false) { await this.send('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile }); }
  async click(selector: string) {
    const rect = await this.evaluate<{ x: number; y: number }>(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing target'); element.scrollIntoView({ block: 'center', behavior: 'instant' }); const rect = element.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...rect, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...rect, button: 'left', clickCount: 1 });
  }
  async key(key: string, modifiers = 0) {
    const codes: Record<string, [string, number]> = { Enter: ['Enter', 13], Tab: ['Tab', 9], ' ': ['Space', 32], Backspace: ['Backspace', 8], ArrowDown: ['ArrowDown', 40], a: ['KeyA', 65] };
    const [code, number] = codes[key] ?? [key, 0];
    const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
    const params = { key, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers, ...(text ? { text, unmodifiedText: text } : {}) };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  }
  async text(value: string) { await this.send('Input.insertText', { text: value }); }
  async replace(value: string) { await this.key('a', 2); await this.text(value); }
  async tabTo(selector: string) {
    for (let index = 0; index < 100; index++) {
      if (await this.evaluate(`document.activeElement?.matches(${JSON.stringify(selector)})`)) return;
      await this.key('Tab');
    }
    throw new Error(`Cannot reach ${selector} with Tab`);
  }
  async close() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      try { await this.send('Browser.close', {}, false); } catch { /* Chrome may close before acknowledging. */ }
      this.socket.close();
    }
    for (const operation of this.pending.values()) { clearTimeout(operation.timer); operation.reject(new Error('Browser closed')); }
    this.pending.clear();
    if (this.process && this.process.exitCode === null) { await Promise.race([once(this.process, 'exit'), pause(2000)]); if (this.process.exitCode === null) this.process.kill(); }
  }
}
