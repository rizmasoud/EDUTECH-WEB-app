import fs from 'node:fs';
import path from 'node:path';

/**
 * Locate the repository root by walking up from `start` until `pnpm-workspace.yaml` is found.
 * This does not depend on the compiled output layout (src/ when run with tsx, but
 * dist/apps/api/src/ after `nest build`), so it cannot drift when the layout changes.
 */
export function findRepoRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Env files for ConfigModule, highest precedence first: `.env.local` then `.env` in the working
 * directory, then the same two in the repository root (found from the working directory, falling
 * back to the directory of the running code). Files that do not exist are skipped by ConfigModule;
 * variables already present in the process environment always win over every file.
 */
export function resolveEnvFilePaths(cwd: string, codeDir: string): string[] {
  const roots = [cwd];
  const repoRoot = findRepoRoot(cwd) ?? findRepoRoot(codeDir);
  if (repoRoot) roots.push(repoRoot);
  return Array.from(new Set(roots.flatMap((r) => [path.join(r, '.env.local'), path.join(r, '.env')])));
}
