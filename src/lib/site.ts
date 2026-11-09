import rawCatalog from '../../generated/catalog.json';
import { catalogSchema } from './schema.ts';

export const catalog = catalogSchema.parse(rawCatalog);
export const localPath = (absoluteUrl: string) => new URL(absoluteUrl).pathname;
export const sitePath = (relativePath = '') => `${catalog.base_path}${relativePath}`;
export const jsonForScript = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');
