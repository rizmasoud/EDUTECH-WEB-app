/**
 * English-only guard for user-facing strings.
 *
 * Product decision: the UI is English. This guard looks for Persian/Arabic LETTERS in the code of the files that
 * render user-facing text, after removing comments, so a Persian comment never fails it but a Persian string,
 * template literal or JSX text does.
 *
 * Deliberate exclusions (documented, not forgotten):
 *  - Persian DIGITS (U+06F0-06F9): number formatting (`toLocaleString('fa-IR')`, lib/format.ts) is a separate,
 *    unchanged concern.
 *  - apps/web/lib/format.ts and apps/web/lib/utils-style Jalali helpers: locale utilities that legitimately contain
 *    Persian (month names, the word "to" in a range). They are not in the guarded list.
 *  - Comments, tests and fixtures: the scanner strips comments; test files are not scanned.
 *  - app/not-found.tsx still has a Persian 404 page that the audit did not list. It is intentionally NOT guarded yet
 *    so this PR stays in scope; add it here when that page is translated.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROPOSAL_STATUS_LABEL, TERM_STATUS_LABEL } from '../../apps/web/lib/labels';

const PERSIAN_LETTER = /[؀-ۯۺ-ۿ]/;

/** Remove // and block comments, leaving string/template literals and JSX text untouched. */
export function stripComments(source: string): string {
  return source.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match, literal) => (literal ? match : ' '),
  );
}

/** Lines of `source` that contain Persian letters outside comments. */
export function persianUserFacingLines(source: string): string[] {
  return stripComments(source)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => PERSIAN_LETTER.test(l));
}

describe('persianUserFacingLines (the guard itself)', () => {
  it('catches a Persian string literal, template literal and JSX text', () => {
    assert.equal(persianUserFacingLines(`const a = 'پیشنهاد رد شد.';`).length, 1);
    assert.equal(persianUserFacingLines('const b = `حذف شد: ${x}`;').length, 1);
    assert.equal(persianUserFacingLines('<th className="p-4">دستمزد هر کلاس</th>').length, 1);
  });

  it('ignores Persian in line and block comments', () => {
    assert.deepEqual(persianUserFacingLines('// توضیح\nconst a = 1; // توضیح\n/* بلوک\nچندخطی */\nconst b = 2;'), []);
  });

  it('is not fooled by "//" inside a string such as a URL, and still sees Persian after it', () => {
    assert.equal(persianUserFacingLines(`const u = 'https://example.com'; const p = 'سلام';`).length, 1);
    assert.deepEqual(persianUserFacingLines(`const u = 'https://example.com/path';`), []);
  });

  it('does not flag Persian digits, which are handled by number formatting', () => {
    assert.deepEqual(persianUserFacingLines(`const d = '۱۲۳';`), []);
  });

  it('does not flag English text', () => {
    assert.deepEqual(persianUserFacingLines(`const m = 'Class schedule updated.';`), []);
  });
});

describe('English user-facing strings in the files this work touches', () => {
  const root = join(__dirname, '../..');
  const files = [
    'apps/web/app/page.tsx',
    'apps/web/lib/labels.ts',
    'apps/web/lib/notifications.ts',
    'apps/web/components/ui/Toast.tsx',
    'apps/web/components/ui/NotificationProvider.tsx',
    'apps/web/components/ui/InlineError.tsx',
    'apps/web/components/people/TeachersManager.tsx',
    'apps/web/components/people/StudentsManager.tsx',
    'apps/web/components/academic/BooksManager.tsx',
    'apps/web/components/academic/AcademicTermsManager.tsx',
    'apps/web/components/classes/ClassEnrollmentsModal.tsx',
    'apps/web/components/classes/ClassesManager.tsx',
  ];

  for (const file of files) {
    it(`${file} has no Persian letters in code or text`, () => {
      assert.deepEqual(persianUserFacingLines(readFileSync(join(root, file), 'utf8')), []);
    });
  }

  it('shows proposal and term statuses in English', () => {
    assert.deepEqual(PROPOSAL_STATUS_LABEL, {
      DRAFT: 'Draft',
      PENDING_REVIEW: 'Pending review',
      ACCEPTED: 'Accepted',
      MODIFIED: 'Modified',
      REJECTED: 'Rejected',
    });
    for (const label of [...Object.values(PROPOSAL_STATUS_LABEL), ...Object.values(TERM_STATUS_LABEL)]) {
      assert.ok(!PERSIAN_LETTER.test(label), label);
    }
  });

  it('labels the teacher pay rate in English in the table and the form', () => {
    const src = readFileSync(join(root, 'apps/web/components/people/TeachersManager.tsx'), 'utf8');
    assert.ok(src.includes('<th className="p-4">Pay per Class</th>'));
    assert.ok(src.includes('Pay per Class *</label>'));
  });
});
