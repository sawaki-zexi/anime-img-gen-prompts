import { parseArgs } from 'node:util';
import { installProbe } from './plugin/codex.ts';

const { values } = parseArgs({ options: { package: { type: 'string' }, state: { type: 'string' }, codex: { type: 'string' } } });
if (!values.package || !values.state) throw new Error('用法: npm run plugin:probe -- --package <构建产物目录> --state <新的隔离目录> [--codex <原生exe或codex.js>]');
const report = await installProbe({ packageRoot: values.package, state: values.state, codex: values.codex });
console.log(JSON.stringify({ passed: report.passed, cli: report.cli, home: report.home, projects: report.projects, installed: report.installed }, null, 2));
