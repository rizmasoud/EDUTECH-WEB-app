/**
 * ClassesManager keeps three kinds of failure apart:
 *  - `error`       class-list loading failure (the only one allowed to replace the table)
 *  - `formError`   save/update failure, rendered INSIDE the edit dialog so the full-screen overlay cannot hide it
 *  - `actionError` activate/complete/cancel failure, a banner above a table that stays visible
 * The component loads data in an effect, so (like term-sync.spec.ts) these are source-level guards.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'apps/web/components/classes/ClassesManager.tsx'), 'utf8');

/** Source of `const <name> = async (...) => { ... };` up to the next top-level handler. */
function handler(name: string): string {
  const start = src.indexOf(`const ${name} = async`);
  assert.ok(start >= 0, `${name} not found`);
  const next = src.indexOf('\n  const ', start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

describe('ClassesManager error separation', () => {
  it('a failed save reports through formError, never through the list-load error', () => {
    const save = handler('handleSaveClass');
    assert.match(save, /setFormError\(err\.message \|\| 'Failed to save class'\)/);
    assert.doesNotMatch(save, /setError\(/);
  });

  it('keeps the dialog open on failure (it only closes after a successful request)', () => {
    const save = handler('handleSaveClass');
    const catchIdx = save.indexOf('catch (err');
    assert.ok(catchIdx > 0);
    assert.doesNotMatch(save.slice(catchIdx), /setIsCreateModalOpen\(false\)/);
  });

  it('renders formError inside the form as an alert, within the modal overlay', () => {
    const modal = src.slice(src.indexOf('{isCreateModalOpen && ('));
    const form = modal.slice(modal.indexOf('<form onSubmit={handleSaveClass}'));
    assert.match(form, /\{formError && \(\s*<div\s+role="alert"/);
    assert.match(form, /<span>\{formError\}<\/span>/);
  });

  it('clears a stale form error whenever the dialog is opened', () => {
    for (const opener of ['openCreateModal', 'openEditModal']) {
      const start = src.indexOf(`const ${opener} =`);
      const body = src.slice(start, src.indexOf('\n  };', start));
      assert.match(body, /setFormError\(null\)/, opener);
    }
  });

  it('activate, complete and cancel report through actionError, not the list-load error', () => {
    for (const name of ['handleActivate', 'handleComplete', 'handleCancel']) {
      const body = handler(name);
      assert.match(body, /setActionError\(err\.message \|\| /, name);
      assert.match(body, /setActionError\(null\)/, name);
      assert.doesNotMatch(body, /setError\(/, name);
    }
  });

  it('only the list-load error replaces the table, and it is only set by the load', () => {
    assert.match(src, /\) : error \? \(\s*<div[^>]*>\s*The class list could not be loaded/);
    const setErrorCalls = src.match(/\bsetError\(/g) ?? [];
    // reset at the start of a load, the load failure, and the dismiss button
    assert.equal(setErrorCalls.length, 3);
    assert.match(handler('fetchClassesAndMetadata'), /setError\(err\.message \|\| 'Failed to fetch classes data'\)/);
  });

  it('a reload (after any successful save/action, or a refresh) clears a stale action error', () => {
    assert.match(handler('fetchClassesAndMetadata'), /setActionError\(null\)/);
  });

  it('shows the action error as a banner without touching the table branch', () => {
    assert.match(src, /\{actionError && \(\s*<div role="alert"/);
    assert.doesNotMatch(src, /actionError \?|\? actionError|formError \?/);
  });
});
