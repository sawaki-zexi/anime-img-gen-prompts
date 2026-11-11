import { parseArgs } from 'node:util';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildPlugin, endpoint, validatePlugin } from './plugin/package.ts';
import { verifyRemoteContract } from './plugin/contract.ts';

const { values } = parseArgs({ options: { 'mcp-url': { type: 'string' }, 'gallery-url': { type: 'string' }, out: { type: 'string' }, evaluation: { type: 'boolean', default: false } } });
if (!values['mcp-url'] || !values['gallery-url'] || !values.out) throw new Error('用法: npm run plugin:build -- --mcp-url <HTTPS端点> --gallery-url <HTTPS画廊> --out <新的产物目录> [--evaluation]');
const mode = values.evaluation ? 'evaluation' : 'release';
endpoint(values['mcp-url'], mode); endpoint(values['gallery-url'], mode);
const liveCheck = values.evaluation ? 'not-run; evaluation package' : await verifyRemoteContract(values['mcp-url'], values['gallery-url']);
const result = await buildPlugin({ output: path.resolve(values.out), mcpUrl: values['mcp-url'], galleryUrl: values['gallery-url'], mode: values.evaluation ? 'evaluation' : 'release', ...(typeof liveCheck === 'object' ? { catalogRevision: liveCheck.catalog_revision } : {}) });
await validatePlugin(result.pluginRoot);
await writeFile(path.join(result.output, 'release-preflight.json'), `${JSON.stringify(liveCheck, null, 2)}\n`);
console.log(JSON.stringify({ ...result.report, live_check: liveCheck, marketplace_root: result.marketplaceRoot, plugin_root: result.pluginRoot }, null, 2));
