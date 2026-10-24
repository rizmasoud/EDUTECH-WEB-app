/**
 * The NestJS API entry point must be the same everywhere: the compiled output layout, `nest start`
 * (the `dev` script) and `node` (the `start` script) - and the compiled code must reach @edutech/shared
 * through the package itself, never through a path to its TypeScript source.
 *
 * Layout: `nest build` and `nest start` both compile with apps/api/tsconfig.build.json. Its `rootDir` pins the
 * common root of the emitted files to the repository root, so the compiled entry is dist/apps/api/src/main.js.
 * (That layout used to be an accident of the shared sources being pulled into the program through a `paths`
 * alias; the build config now pins it explicitly.) `nest start` only looks at dist/<sourceRoot>/<entryFile> and
 * dist/<entryFile>, so nest-cli.json must name the real path in `entryFile`.
 *
 * Shared package: tsconfig.json keeps the `@edutech/shared` -> source alias for tests (tsx) and editors, but the
 * build config must clear it. Otherwise Nest rewrites the alias into a relative require of
 * packages/shared/src/index.ts, which Node cannot load.
 *
 * Reads configuration files only: no build, no database, no network.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const apiDir = path.resolve(__dirname, '../../apps/api');
const repoRoot = path.resolve(apiDir, '../..');
const read = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');
const readJson = (f: string) => JSON.parse(read(apiDir, f));
/** tsconfig files may contain comments. */
const readTsconfig = (f: string) => {
  const parsed = ts.parseConfigFileTextToJson(f, read(apiDir, f));
  assert.equal(parsed.error, undefined, `${f} must be valid tsconfig JSON`);
  return parsed.config as { compilerOptions?: Record<string, any> };
};

const pkg = readJson('package.json');
const nest = readJson('nest-cli.json');
const tsconfig = readTsconfig('tsconfig.json');
const buildConfig = readTsconfig('tsconfig.build.json');
const sharedPkg = JSON.parse(read(repoRoot, 'packages/shared/package.json'));

/** The entry file relative to the root directory the build config pins for all emitted files. */
function expectedEntryFile(): string {
  const rootDir = buildConfig.compilerOptions?.rootDir;
  assert.ok(rootDir, 'tsconfig.build.json must pin rootDir so the output layout cannot drift');
  return path
    .relative(path.resolve(apiDir, rootDir), path.join(apiDir, 'src', 'main'))
    .split(path.sep)
    .join('/');
}

describe('API entry point consistency', () => {
  it('the build config pins rootDir to the repository root', () => {
    assert.equal(path.resolve(apiDir, buildConfig.compilerOptions?.rootDir), repoRoot);
  });

  it('nest-cli.json compiles with the build config and its entryFile matches where main.js is emitted', () => {
    assert.equal(nest.compilerOptions?.tsConfigPath, 'tsconfig.build.json');
    assert.equal(nest.entryFile, expectedEntryFile());
    assert.equal(nest.entryFile, 'apps/api/src/main');
  });

  it('the start script runs exactly the compiled entry file', () => {
    assert.equal(pkg.scripts.start, `node dist/${nest.entryFile}.js`);
  });

  it('dev runs `nest start --watch` through the runner that prepares @edutech/shared first', () => {
    assert.equal(pkg.scripts.dev, 'node ../../scripts/dev-api.mjs');
    const runner = read(repoRoot, 'scripts/dev-api.mjs');
    assert.match(runner, /'@edutech\/shared', 'build'/, 'builds shared before starting');
    assert.match(runner, /'@edutech\/shared', 'exec', 'tsc', '--watch'/, 'keeps shared compiling');
    assert.match(runner, /'nest', 'start', '--watch'/, 'starts Nest in watch mode (reads entryFile)');
    assert.ok(fs.existsSync(path.join(apiDir, 'src', 'main.ts')));
  });

  it('no postbuild hook rewrites the compiled output (a wrapper would overwrite the real main.js)', () => {
    assert.equal(pkg.scripts.postbuild, undefined);
  });
});

describe('API reaches @edutech/shared through the package, not its source', () => {
  it('the shared package declares its compiled output as the runtime and type entry', () => {
    assert.equal(sharedPkg.main, './dist/index.js');
    assert.equal(sharedPkg.types, './dist/index.d.ts');
    assert.equal(sharedPkg.exports['.'].require, './dist/index.js');
  });

  it('the build config clears the source alias so Nest cannot rewrite it into a .ts path', () => {
    assert.deepEqual(buildConfig.compilerOptions?.paths, {});
  });

  it('tsconfig.json keeps the source alias, which tests (tsx) and editors rely on', () => {
    const paths = tsconfig.compilerOptions?.paths ?? {};
    assert.deepEqual(paths['@edutech/shared'], ['../../packages/shared/src/index.ts']);
  });

  it('the production build prepares shared first', () => {
    assert.match(pkg.scripts.prebuild, /@edutech\/shared build/);
  });
});
