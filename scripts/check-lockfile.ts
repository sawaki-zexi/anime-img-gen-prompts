import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

type LockEntry = { version?: string; resolved?: string; integrity?: string; link?: boolean; inBundle?: boolean };
type Lockfile = { lockfileVersion: number; packages: Record<string, LockEntry> };

/** Runs on Node alone, before npm ci has installed any project dependencies. */
export function checkLockfile(lock: Lockfile): string[] {
  if (lock.lockfileVersion !== 3 || !lock.packages) return ['Expected a v3 package-lock.json with package records'];
  const errors: string[] = [];
  for (const [location, entry] of Object.entries(lock.packages)) {
    // Root/workspace definitions and links do not describe registry tarballs.
    if (!location.includes('node_modules/') || entry.link) continue;
    const required = entry.inBundle ? ['version'] as const : ['version', 'resolved', 'integrity'] as const;
    for (const field of required) {
      if (typeof entry[field] !== 'string' || !entry[field]!.trim()) errors.push(`${location}: missing ${field}`);
    }
  }
  return errors;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8')) as Lockfile;
  const errors = checkLockfile(lock);
  if (errors.length) throw new Error(`Incomplete dependency lock records:\n${errors.join('\n')}`);
  console.log(`Lockfile complete: ${Object.keys(lock.packages).length - 1} dependency records`);
}
