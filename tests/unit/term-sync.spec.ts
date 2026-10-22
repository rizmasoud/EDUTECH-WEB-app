/**
 * The header selector and the Classes screen share one source of truth for the selected term.
 * Rendering-level checks plus source-level guards for the patterns that caused the Phase 1 audit findings.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('selected term is owned by the shell', () => {
  const manager = read('apps/web/components/classes/ClassesManager.tsx');

  it('ClassesManager derives its term from the shell and has no independent term state', () => {
    assert.match(manager, /const selectedTermId = activeTerm\?\.id \?\? ''/);
    assert.doesNotMatch(manager, /setSelectedTermId/);
  });

  it('ClassesManager changes the term only through onSelectTerm', () => {
    assert.match(manager, /onSelectTerm\?\.\(next\)/);
  });

  it('ClassesManager no longer offers "All Academic Terms", which could disagree with the header', () => {
    assert.doesNotMatch(manager, /All Academic Terms/);
  });
});

describe('page.tsx cannot recreate the refresh loop', () => {
  const page = read('apps/web/app/page.tsx');

  /** Dependency arrays of React hooks: `}, [a, b])` and `useCallback(() => x, [a])`. */
  const hookDeps = (src: string) =>
    [...src.matchAll(/(?:\}|\)\s*=>[^\n]*?|\)),\s*\[([^\]\n]*)\]\s*\)/g)].map((m) => m[1]);

  it('the dependency scanner finds the pattern that caused the loop', () => {
    const bad = 'const f = useCallback(async () => {\n  x();\n}, [activeTerm, activeProposal, isSupervisor]);';
    assert.deepEqual(hookDeps(bad), ['activeTerm, activeProposal, isSupervisor']);
  });

  it('no hook lists activeTerm or activeProposal as a dependency', () => {
    const deps = hookDeps(page);
    assert.ok(deps.length >= 2, 'expected to find the hook dependency arrays in page.tsx');
    for (const d of deps) {
      assert.doesNotMatch(d, /activeProposal|activeTerm/, `hook deps must not include selection state: [${d}]`);
    }
  });

  it('term changes go through one handler that calls the controller', () => {
    assert.match(page, /dataController\.selectTerm\(term\)/);
    assert.doesNotMatch(page, /apiClient\.getClasses\(/);
    assert.doesNotMatch(page, /apiClient\.getProposals\(/);
  });

  it('there is exactly one place that triggers a full refresh from an effect', () => {
    const hits = page.match(/void dataController\.refresh\(\)/g) ?? [];
    assert.equal(hits.length, 1);
  });
});
