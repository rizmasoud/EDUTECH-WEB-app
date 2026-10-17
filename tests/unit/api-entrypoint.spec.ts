/**
 * The NestJS API entry point must be the same everywhere: the compiled output layout, `nest start`
 * (the `dev` script) and `node` (the `start` script).
 *
 * tsconfig maps `@edutech/shared` to ../../packages/shared/src, outside apps/api. TypeScript then
 * computes the common source root as the repository root, so the compiled entry is
 * dist/apps/api/src/main.js, not dist/main.js. `nest start` only looks at dist/<sourceRoot>/<entryFile>
 * and dist/<entryFile>, so nest-cli.json must name the real path in `entryFile`.
 *
 * Reads configuration files only: no build, no database, no network.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const apiDir = path.resolve(__dirname, '../../apps/api');
const repoRoot = path.resolve(apiDir, '../..');
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(apiDir, f), 'utf8'));

const pkg = readJson('package.json');
const nest = readJson('nest-cli.json');
const tsconfig = readJson('tsconfig.json');

/** The directory TypeScript uses as the common root of all emitted files (no explicit rootDir). */
function expectedEntryFile(): string {
  const paths: Record<string, string[]> = tsconfig.compilerOptions?.paths ?? {};
  const baseUrl = path.resolve(apiDir, tsconfig.compilerOptions?.baseUrl ?? '.');
  const srcDir = path.join(apiDir, 'src');
  const escapes = Object.values(paths)
    .flat()
    .some((t) => path.relative(srcDir, path.resolve(baseUrl, t)).startsWith('..'));
  const root = escapes ? repoRoot : srcDir;
  return path.relative(root, path.join(srcDir, 'main')).split(path.sep).join('/');
}

describe('API entry point consistency', () => {
  it('tsconfig has no explicit rootDir (the layout rule below depends on it)', () => {
    assert.equal(tsconfig.compilerOptions?.rootDir, undefined);
  });

  it('nest-cli.json entryFile matches where the compiler emits main.js', () => {
    assert.equal(nest.entryFile, expectedEntryFile());
  });

  it('the start script runs exactly the compiled entry file', () => {
    assert.equal(pkg.scripts.start, `node dist/${nest.entryFile}.js`);
  });

  it('dev uses nest start (which reads entryFile) and the entry file exists in source', () => {
    assert.match(pkg.scripts.dev, /^nest start\b/);
    assert.ok(fs.existsSync(path.join(apiDir, 'src', 'main.ts')));
  });

  it('no postbuild hook rewrites the compiled output (a wrapper would overwrite the real main.js)', () => {
    assert.equal(pkg.scripts.postbuild, undefined);
  });
});
