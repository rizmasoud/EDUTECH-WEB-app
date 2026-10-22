/**
 * Regression: the API must find the repository-root .env however it is launched.
 *
 * `nest build` emits app.module.js at apps/api/dist/apps/api/src/, so a fixed `../../..` from
 * __dirname lands in apps/api/dist, not the repository root. The root is now found by walking up
 * to pnpm-workspace.yaml. Temp directories only; no .env content is read or printed.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findRepoRoot, resolveEnvFilePaths } from '../../apps/api/src/shared/config/env-files';

let tmp: string;
let root: string;
let apiDir: string;
let compiledDir: string;
let outside: string;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edutech-envfiles-'));
  root = path.join(tmp, 'repo');
  apiDir = path.join(root, 'apps', 'api');
  compiledDir = path.join(apiDir, 'dist', 'apps', 'api', 'src');
  outside = path.join(tmp, 'elsewhere');
  fs.mkdirSync(compiledDir, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('env file resolution', () => {
  it('documents the bug: ../../.. from the compiled directory is apps/api/dist, not the repo root', () => {
    assert.equal(path.resolve(compiledDir, '..', '..', '..'), path.join(apiDir, 'dist'));
    assert.notEqual(path.resolve(compiledDir, '..', '..', '..'), root);
  });

  it('findRepoRoot works from the source directory, the package directory and the compiled directory', () => {
    assert.equal(findRepoRoot(root), root);
    assert.equal(findRepoRoot(apiDir), root);
    assert.equal(findRepoRoot(compiledDir), root);
    assert.equal(findRepoRoot(path.parse(tmp).root), null);
  });

  it('started from apps/api (pnpm --filter): package .env first, then the repository root', () => {
    assert.deepEqual(resolveEnvFilePaths(apiDir, compiledDir), [
      path.join(apiDir, '.env.local'),
      path.join(apiDir, '.env'),
      path.join(root, '.env.local'),
      path.join(root, '.env'),
    ]);
  });

  it('started from the repository root: no duplicates', () => {
    assert.deepEqual(resolveEnvFilePaths(root, compiledDir), [
      path.join(root, '.env.local'),
      path.join(root, '.env'),
    ]);
  });

  it('started from an unrelated directory: the root is still found from the code location', () => {
    const paths = resolveEnvFilePaths(outside, compiledDir);
    assert.ok(paths.includes(path.join(root, '.env')));
    assert.equal(paths[0], path.join(outside, '.env.local'));
  });

  it('no repository found anywhere: only the working directory is used', () => {
    assert.deepEqual(resolveEnvFilePaths(outside, outside), [
      path.join(outside, '.env.local'),
      path.join(outside, '.env'),
    ]);
  });

  it('for this repository, apps/api and the compiled layout both resolve to the real root .env', () => {
    const real = path.resolve(__dirname, '../..');
    const out = resolveEnvFilePaths(path.join(real, 'apps', 'api'), path.join(real, 'apps/api/dist/apps/api/src'));
    assert.ok(out.includes(path.join(real, '.env')));
  });
});
