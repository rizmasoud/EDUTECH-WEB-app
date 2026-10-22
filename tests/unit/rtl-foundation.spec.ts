/**
 * RTL and typography foundation: static checks on the files Next.js actually serves.
 * No browser: it verifies structure, self-hosted font, and that the NEW UI (shell, Overview, login, primitives)
 * uses logical (direction-aware) utilities only. Legacy screens are not covered until they are redesigned.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((n) => {
    const rel = join(dir, n);
    return statSync(join(ROOT, rel)).isDirectory() ? files(rel) : [rel];
  });
}

describe('RTL and Persian typography foundation', () => {
  it('both layouts declare Persian and right-to-left on <html>', () => {
    // The root app/ is the Next app that is served; apps/web/app is the canonical copy.
    for (const layout of ['app/layout.tsx', 'apps/web/app/layout.tsx']) {
      assert.match(read(layout), /<html lang="fa" dir="rtl">/, `${layout} must set lang="fa" dir="rtl"`);
    }
  });

  it('serves a single stylesheet: the root globals import the canonical one', () => {
    assert.match(read('app/globals.css'), /@import "\.\.\/apps\/web\/app\/globals\.css";/);
  });

  it('self-hosts Vazirmatn with its license and makes no third-party font request', () => {
    const woff2 = join(ROOT, 'public/fonts/Vazirmatn-Variable.woff2');
    assert.ok(existsSync(woff2), 'font file is missing');
    assert.equal(readFileSync(woff2).subarray(0, 4).toString('latin1'), 'wOF2', 'not a WOFF2 file');
    const license = read('public/fonts/Vazirmatn-OFL.txt');
    assert.match(license, /SIL OPEN FONT LICENSE/i);

    const css = read('apps/web/app/globals.css');
    assert.match(css, /font-family:\s*"Vazirmatn"/);
    assert.match(css, /url\("\/fonts\/Vazirmatn-Variable\.woff2"\)/);
    assert.ok(!/https?:\/\//.test(css), 'no remote URL may appear in the stylesheet');
    assert.match(css, /--font-sans:\s*"Vazirmatn"/);
    for (const layout of ['app/layout.tsx', 'apps/web/app/layout.tsx']) {
      assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(read(layout)), `${layout} must not load a remote font`);
    }
  });

  it('gives Persian text enough line height and keeps identifiers left-to-right', () => {
    const css = read('apps/web/app/globals.css');
    assert.match(css, /line-height:\s*1\.75/);
    assert.match(css, /\[dir="ltr"\]\s*\{\s*unicode-bidi:\s*isolate/);
  });

  it('uses only direction-aware utilities in the new components', () => {
    const FORBIDDEN: Array<[RegExp, string]> = [
      [/\b(?:ml|mr|pl|pr)-(?:\d|\[|auto|px)/, 'physical margin/padding (use ms-/me-/ps-/pe-)'],
      [/\btext-(?:left|right)\b/, 'physical text alignment (use text-start/text-end)'],
      [/\b(?:left|right)-(?:\d|\[|auto|full)/, 'physical offset (use start-/end-)'],
      [/\bborder-(?:l|r)\b|\bborder-(?:l|r)-/, 'physical border side (use border-s/border-e)'],
      [/\brounded-(?:l|r|tl|tr|bl|br)\b|\brounded-(?:l|r|tl|tr|bl|br)-/, 'physical radius (use rounded-s/-e)'],
      [/\bspace-x-/, 'space-x flips badly in RTL (use gap-)'],
      [/\buppercase\b|\btracking-/, 'letter-spacing and case transforms break Persian'],
    ];
    const targets = [
      ...files('apps/web/components/shell'),
      ...files('apps/web/components/overview'),
      ...files('apps/web/components/auth'),
      ...files('apps/web/components/ui'),
      'app/error.tsx',
      'app/not-found.tsx',
    ].filter((f) => /\.tsx$/.test(f));
    assert.ok(targets.length >= 8, `expected the new UI files, found ${targets.length}`);
    for (const file of targets) {
      const src = read(file);
      for (const [pattern, why] of FORBIDDEN) {
        assert.ok(!pattern.test(src), `${file}: ${why}`);
      }
    }
  });

  it('keeps text-size floor readable in the new components (no 10px/11px text)', () => {
    for (const file of [
      ...files('apps/web/components/shell'),
      ...files('apps/web/components/overview'),
      ...files('apps/web/components/auth'),
      ...files('apps/web/components/ui'),
    ]) {
      assert.ok(!/text-\[1[01]px\]/.test(read(file)), `${file} uses text smaller than 12px`);
    }
  });

  it('navigation is labeled: no icon-only navigation item', () => {
    const shell = read('apps/web/components/shell/AppShell.tsx');
    assert.match(shell, /<span>\{item\.label\}<\/span>/, 'each nav item renders its text label');
    const page = read('apps/web/app/page.tsx');
    const labels = [...page.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(labels, [
      'نمای کلی',
      'زمان‌بندی',
      'کلاس‌ها',
      'دانش‌آموزان',
      'معلم‌ها',
      'کتاب‌ها',
      'ترم‌ها',
      'برنامه هفتگی',
    ]);
  });

  it('uses the agreed terminology', () => {
    const page = read('apps/web/app/page.tsx');
    for (const term of ['دانش‌آموزان', 'معلم‌ها', 'کلاس‌ها', 'ترم‌ها', 'کتاب‌ها', 'زمان‌بندی']) {
      assert.ok(page.includes(term), `missing ${term}`);
    }
    const overview = read('apps/web/components/overview/OverviewPage.tsx');
    assert.ok(overview.includes('پیشنهاد زمان‌بندی'));
    assert.ok(overview.includes('دانش‌آموز'));
  });
});

describe('Overview page has no table', () => {
  it('renders no <table> element and no table-style markup', () => {
    const src = read('apps/web/components/overview/OverviewPage.tsx');
    assert.ok(!/<table|<thead|<tbody|<tr\b|<th\b|<td\b/.test(src), 'Overview must not contain a table');
  });

  it('preserves the Gregorian API values: Overview formats for display only', () => {
    const src = read('apps/web/components/overview/OverviewPage.tsx');
    assert.ok(!/\.startDate\s*=|\.endDate\s*=/.test(src), 'must not assign over API fields');
  });
});
