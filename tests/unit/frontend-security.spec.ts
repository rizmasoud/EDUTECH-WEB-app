/**
 * Frontend security regression: no demo credentials in the client bundle, and no automatic login.
 * Static source checks (no browser, no network) plus the pure login-error mapping.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describeLoginError } from '../../apps/web/lib/auth-errors';

const WEB = join(__dirname, '../../apps/web');
const ROOT_APP = join(__dirname, '../../app');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|css|json)$/.test(name)) out.push(full);
  }
  return out;
}

const clientFiles = [...sourceFiles(WEB), ...sourceFiles(ROOT_APP)];
const page = readFileSync(join(WEB, 'app/page.tsx'), 'utf8');

/** Source of `function name(...) { ... }` (brace matched). */
function functionBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  const open = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unbalanced braces after ${signature}`);
}

describe('Frontend carries no demo credentials', () => {
  it('has no known demo password anywhere in the client sources', () => {
    for (const file of clientFiles) {
      const text = readFileSync(file, 'utf8');
      assert.ok(!text.includes('SupervisorPass123!'), `${file} contains the demo supervisor password`);
      assert.ok(!text.includes('TeacherPass123!'), `${file} contains the demo teacher password`);
    }
  });

  it('has no hard-coded demo personnel codes in the client sources', () => {
    for (const file of clientFiles) {
      const text = readFileSync(file, 'utf8');
      assert.ok(!/['"`]SUP-01['"`]/.test(text), `${file} hard-codes SUP-01`);
      assert.ok(!/['"`]TCH-01['"`]/.test(text), `${file} hard-codes TCH-01`);
    }
  });

  it('starts with an empty personnel code and an empty password', () => {
    assert.match(page, /useState\(''\);\s*\n\s*const \[loginPassword, setLoginPassword\] = useState\(''\)/);
  });

  it('has no quick-fill account buttons', () => {
    assert.ok(!/Quick Role Account Selection/i.test(page));
    assert.ok(!/setLoginPassword\('[^']+'\)/.test(page), 'a literal password is being set');
    assert.ok(!/setLoginPersonnelCode\('[^']+'\)/.test(page), 'a literal personnel code is being set');
  });
});

describe('Frontend never logs in automatically', () => {
  it('checks the existing session only on page load (initAuth never calls login)', () => {
    const body = functionBody(page, 'async function initAuth');
    assert.ok(body.includes('apiClient.getMe()'), 'initAuth must check the current session');
    assert.ok(!/\.login\s*\(/.test(body), 'initAuth must not call login');
  });

  it('calls login from exactly one place: the submit handler', () => {
    const calls = clientFiles
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('api-client.ts'))
      .flatMap((f) => (readFileSync(f, 'utf8').match(/apiClient\.login\s*\(/g) ?? []).map(() => f));
    assert.equal(calls.length, 1, `unexpected login call sites: ${calls.join(', ')}`);
    assert.ok(calls[0].endsWith('app/page.tsx'));
    assert.ok(functionBody(page, 'const handleLoginSubmit = async').includes('apiClient.login('));
  });

  it('does not fetch application data while there is no signed-in user', () => {
    // Prevents a burst of 401s (and error toasts) behind the login form.
    assert.match(page, /if \(!authLoading && currentUser\) \{\s*\n\s*void dataController\.refresh\(\);/);
  });

  it('login view never pre-fills credentials', () => {
    const view = readFileSync(join(WEB, 'components/auth/LoginView.tsx'), 'utf8');
    assert.ok(!/defaultValue=/.test(view));
    assert.ok(!/useState\(['"`][^'"`]+['"`]\)/.test(view), 'LoginView must not seed state with a literal');
    assert.match(view, /type="password"/);
    assert.match(view, /autoComplete="current-password"/);
  });
});

describe('Teacher role stays on the read-only schedule portal', () => {
  it('the teacher gets one navigation destination and no supervisor screen', () => {
    const teacherNav = page.slice(page.indexOf('const TEACHER_NAV'), page.indexOf('/**', page.indexOf('const TEACHER_NAV')));
    assert.equal((teacherNav.match(/\bid: '/g) ?? []).length, 1, 'exactly one teacher nav item');
    assert.match(teacherNav, /id: 'SCHEDULING'/);
  });

  it('renders TeacherScheduleView only in the non-supervisor branch and every management screen only in the supervisor branch', () => {
    const branch = page.indexOf('{!isSupervisor ? (');
    const supervisorSide = page.indexOf(') : (', branch);
    assert.ok(branch > 0 && supervisorSide > branch, 'role branch not found');
    const teacherPart = page.slice(branch, supervisorSide);
    const supervisorPart = page.slice(supervisorSide);
    assert.ok(teacherPart.includes('<TeacherScheduleView'));
    for (const screen of [
      'OverviewPage',
      'StudentsManager',
      'TeachersManager',
      'ClassesManager',
      'BooksManager',
      'AcademicTermsManager',
      'ProposalReviewPanel',
      'WeeklyTimetable',
      'ClassesOverview',
    ]) {
      assert.ok(!teacherPart.includes(`<${screen}`), `${screen} must not render for a teacher`);
      assert.ok(supervisorPart.includes(`<${screen}`), `${screen} is expected in the supervisor branch`);
    }
  });

  it('only a supervisor requests proposals (a teacher would get 403 on that endpoint)', () => {
    // The page never calls the endpoint itself; every request goes through the data controller...
    assert.doesNotMatch(page, /apiClient\.getProposals\(/);
    assert.match(page, /dataController\.setSupervisor\(isSupervisor\)/);
    // ...and the controller has exactly one call site, guarded by the role.
    const controller = readFileSync(join(WEB, 'lib/app-data-controller.ts'), 'utf8');
    const calls = [...controller.matchAll(/this\.api\.getProposals\(/g)];
    assert.equal(calls.length, 1);
    const before = controller.slice(Math.max(0, (calls[0].index ?? 0) - 80), calls[0].index);
    assert.match(before, /this\.supervisor\s*\n?\s*\?/, 'getProposals must be guarded by the supervisor role');
  });

  it('the shell exposes no supervisor-only navigation item to a teacher', () => {
    const supNav = page.slice(page.indexOf('const SUPERVISOR_NAV'), page.indexOf('const TEACHER_NAV'));
    for (const id of ['OVERVIEW', 'SCHEDULING', 'CLASSES', 'STUDENTS', 'TEACHERS', 'BOOKS', 'TERMS']) {
      assert.ok(supNav.includes(`id: '${id}'`), `supervisor nav is missing ${id}`);
    }
    assert.match(page, /items=\{isSupervisor \? SUPERVISOR_NAV : TEACHER_NAV\}/);
    assert.match(page, /activeId=\{isSupervisor \? mainSection : 'SCHEDULING'\}/);
  });
});

describe('Login error messages', () => {
  it('maps the API error codes to Persian messages', () => {
    assert.equal(describeLoginError({ code: 'INVALID_CREDENTIALS' }), 'کد پرسنلی یا رمز عبور اشتباه است.');
    assert.match(describeLoginError({ code: 'ACCOUNT_INACTIVE' }), /غیرفعال/);
    assert.match(describeLoginError({ code: 'RATE_LIMIT_EXCEEDED' }), /تلاش/);
    assert.match(describeLoginError({ code: 'BACKEND_UNAVAILABLE' }), /سرور/);
  });

  it('uses a generic message for unknown failures and never echoes server text', () => {
    const generic = describeLoginError({ code: 'SOMETHING_ELSE', message: 'secret internal detail' });
    assert.equal(generic, describeLoginError(null));
    assert.ok(!generic.includes('secret'));
    assert.equal(describeLoginError(new Error('boom')), generic);
    assert.equal(describeLoginError(undefined), generic);
  });

  it('keeps every mapped code identical to a code the API really emits', () => {
    const auth = readFileSync(join(__dirname, '../../apps/api/src/auth/application/auth.service.ts'), 'utf8');
    for (const code of ['INVALID_CREDENTIALS', 'ACCOUNT_INACTIVE', 'RATE_LIMIT_EXCEEDED']) {
      assert.ok(auth.includes(`code: '${code}'`), `${code} is not emitted by auth.service.ts`);
    }
    const proxy = readFileSync(join(WEB, 'app/api/v1/[...path]/route.ts'), 'utf8');
    assert.ok(proxy.includes("code: 'BACKEND_UNAVAILABLE'"));
  });
});
