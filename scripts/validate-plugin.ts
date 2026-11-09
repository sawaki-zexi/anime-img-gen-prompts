import { parseArgs } from 'node:util';
import path from 'node:path';
import { validatePlugin } from './plugin/package.ts';

const { values } = parseArgs({ options: { root: { type: 'string' } } });
if (!values.root) throw new Error('用法: npm run plugin:validate -- --root <插件根目录>');
console.log(JSON.stringify(await validatePlugin(path.resolve(values.root)), null, 2));
