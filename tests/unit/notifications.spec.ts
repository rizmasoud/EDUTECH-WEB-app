/**
 * App-wide notifications: the store (lib/notifications.ts) with a controllable clock, and the rendered provider /
 * viewport (components/ui/NotificationProvider.tsx) via React SSR, like overview-ui.spec.ts.
 *
 * Limits of this setup (no DOM, no browser): effects do not run under SSR, so hover/focus pausing and the unmount
 * cleanup in the provider are covered by the store tests (pause/resume/dispose) plus a source check that the
 * provider wires them. Stacking is checked from the class names, not from computed styles in a browser.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  DEFAULT_AUTO_DISMISS_MS,
  HARD_CAP,
  MAX_VISIBLE,
  NotificationStore,
  type NotificationClock,
} from '../../apps/web/lib/notifications';
import {
  NotificationProvider,
  NotificationViewport,
  useNotifications,
} from '../../apps/web/components/ui/NotificationProvider';

class FakeClock implements NotificationClock {
  t = 0;
  private next = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();
  setTimeout(fn: () => void, ms: number) {
    const id = this.next++;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  }
  clearTimeout(handle: unknown) {
    this.timers.delete(handle as number);
  }
  now() {
    return this.t;
  }
  advance(ms: number) {
    const target = this.t + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, x]) => x.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.t = due[1].at;
      this.timers.delete(due[0]);
      due[1].fn();
    }
    this.t = target;
  }
  get pending() {
    return this.timers.size;
  }
}

function setup() {
  const clock = new FakeClock();
  const store = new NotificationStore(clock);
  return { clock, store, messages: () => store.getSnapshot().map((n) => n.message) };
}

describe('NotificationStore: identity and independent timers', () => {
  it('gives notifications with identical text different ids and one timer each', () => {
    const { clock, store } = setup();
    const a = store.notify('success', 'Saved');
    const b = store.notify('success', 'Saved');
    assert.notEqual(a, b);
    assert.equal(new Set(store.getSnapshot().map((n) => n.id)).size, 2);
    assert.equal(clock.pending, 2);
  });

  it('an older timer never dismisses a newer notification with the same text', () => {
    const { clock, store, messages } = setup();
    store.notify('success', 'Saved'); // t = 0, due at 5000
    clock.advance(3000);
    store.notify('success', 'Saved'); // t = 3000, due at 8000
    clock.advance(2000); // t = 5000: only the first is due
    assert.deepEqual(messages(), ['Saved']);
    clock.advance(2999); // t = 7999
    assert.deepEqual(messages(), ['Saved']);
    clock.advance(1); // t = 8000
    assert.deepEqual(messages(), []);
  });

  it('dismissing one notification leaves another with identical text, and clears only its timer', () => {
    const { clock, store } = setup();
    const first = store.notify('info', 'Same text');
    const second = store.notify('info', 'Same text');
    store.dismiss(first);
    assert.deepEqual(store.getSnapshot().map((n) => n.id), [second]);
    assert.equal(clock.pending, 1);
    clock.advance(DEFAULT_AUTO_DISMISS_MS);
    assert.equal(store.getSnapshot().length, 0);
  });

  it('ignores dismissing an unknown id without notifying listeners', () => {
    const { store } = setup();
    store.notify('info', 'x');
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.dismiss('nope');
    assert.equal(calls, 0);
  });
});

describe('NotificationStore: auto-dismiss rules', () => {
  it('auto-dismisses success and info after about 5 seconds (within the required 4-5 s)', () => {
    assert.ok(DEFAULT_AUTO_DISMISS_MS >= 4000 && DEFAULT_AUTO_DISMISS_MS <= 5000);
    for (const type of ['success', 'info'] as const) {
      const { clock, store } = setup();
      store.notify(type, 'x');
      clock.advance(DEFAULT_AUTO_DISMISS_MS - 1);
      assert.equal(store.getSnapshot().length, 1, `${type} gone too early`);
      clock.advance(1);
      assert.equal(store.getSnapshot().length, 0, `${type} still visible`);
    }
  });

  it('keeps an error until it is dismissed, with no timer running', () => {
    const { clock, store } = setup();
    const id = store.notify('error', 'Could not save');
    assert.equal(clock.pending, 0);
    clock.advance(60 * 60 * 1000);
    assert.equal(store.getSnapshot().length, 1);
    store.dismiss(id);
    assert.equal(store.getSnapshot().length, 0);
  });

  it('honours an explicit duration, including a persistent success and a timed error', () => {
    const { clock, store, messages } = setup();
    store.notify('success', 'sticky', { durationMs: null });
    store.notify('error', 'timed', { durationMs: 1000 });
    clock.advance(1000);
    assert.deepEqual(messages(), ['sticky']);
    clock.advance(60_000);
    assert.deepEqual(messages(), ['sticky']);
  });

  it('pausing holds the countdown and resuming continues with the time that was left', () => {
    const { clock, store } = setup();
    const id = store.notify('success', 'x');
    clock.advance(3000);
    store.pause(id);
    assert.equal(clock.pending, 0, 'pause clears the running timer');
    clock.advance(60_000);
    assert.equal(store.getSnapshot().length, 1, 'still visible while paused');
    store.resume(id);
    clock.advance(1999);
    assert.equal(store.getSnapshot().length, 1);
    clock.advance(1);
    assert.equal(store.getSnapshot().length, 0);
  });

  it('pause/resume are harmless on errors, repeated calls, and unknown ids', () => {
    const { clock, store } = setup();
    const err = store.notify('error', 'e');
    store.pause(err);
    store.resume(err);
    store.pause('nope');
    store.resume('nope');
    assert.equal(clock.pending, 0);
    const ok = store.notify('info', 'i');
    store.resume(ok); // already running: must not start a second timer
    assert.equal(clock.pending, 1);
  });
});

describe('NotificationStore: timer cleanup', () => {
  it('dismissing clears the notification timer', () => {
    const { clock, store } = setup();
    const id = store.notify('success', 'x');
    assert.equal(clock.pending, 1);
    store.dismiss(id);
    assert.equal(clock.pending, 0);
  });

  it('dispose (provider unmount) clears every timer and notification, and the store stays usable', () => {
    const { clock, store } = setup();
    store.notify('success', 'a');
    store.notify('info', 'b');
    store.notify('error', 'c');
    assert.equal(clock.pending, 2);
    store.dispose();
    assert.equal(clock.pending, 0);
    assert.equal(store.getSnapshot().length, 0);
    store.notify('success', 'again'); // StrictMode remount
    assert.equal(clock.pending, 1);
    clock.advance(DEFAULT_AUTO_DISMISS_MS);
    assert.equal(store.getSnapshot().length, 0);
  });

  it('a timer that fires after dispose does nothing', () => {
    const { clock, store } = setup();
    store.notify('success', 'a');
    store.dispose();
    clock.advance(DEFAULT_AUTO_DISMISS_MS * 2);
    assert.equal(store.getSnapshot().length, 0);
  });
});

describe('NotificationStore: bounded list', () => {
  it('drops the oldest success/info first and clears its timer', () => {
    const { clock, store, messages } = setup();
    for (let i = 1; i <= MAX_VISIBLE + 1; i += 1) store.notify('success', `m${i}`);
    assert.equal(store.getSnapshot().length, MAX_VISIBLE);
    assert.equal(messages()[0], 'm2');
    assert.equal(clock.pending, MAX_VISIBLE);
  });

  it('does not drop an error to make room for a success', () => {
    const { store, messages } = setup();
    store.notify('error', 'keep me');
    for (let i = 1; i <= MAX_VISIBLE + 2; i += 1) store.notify('success', `m${i}`);
    assert.ok(messages().includes('keep me'));
    assert.equal(store.getSnapshot().length, MAX_VISIBLE);
  });

  it('only drops errors past the hard cap, and never the one just added', () => {
    const { store, messages } = setup();
    for (let i = 1; i <= HARD_CAP; i += 1) store.notify('error', `e${i}`);
    assert.equal(store.getSnapshot().length, HARD_CAP);
    store.notify('error', 'newest');
    assert.equal(store.getSnapshot().length, HARD_CAP);
    assert.equal(messages()[messages().length - 1], 'newest');
    assert.ok(!messages().includes('e1'));
  });
});

describe('NotificationViewport and NotificationProvider rendering', () => {
  const noop = () => {};
  const render = (items: Parameters<typeof NotificationViewport>[0]['notifications']) =>
    renderToString(
      React.createElement(NotificationViewport, { notifications: items, onDismiss: noop, onPause: noop, onResume: noop }),
    );

  it('always renders a polite status region and an assertive alert region, even when empty', () => {
    const html = render([]);
    assert.match(html, /role="status"[^>]*aria-live="polite"/);
    assert.match(html, /role="alert"[^>]*aria-live="assertive"/);
    assert.match(html, /aria-relevant="additions"/);
  });

  it('puts success/info in the polite region and errors in the assertive one', () => {
    const html = render([
      { id: 'n1', type: 'success', message: 'Saved ok' },
      { id: 'n2', type: 'info', message: 'FYI note' },
      { id: 'n3', type: 'error', message: 'Broke badly' },
    ]);
    const alertAt = html.indexOf('role="alert"');
    assert.ok(alertAt > 0);
    const polite = html.slice(0, alertAt);
    const assertive = html.slice(alertAt);
    assert.ok(polite.includes('Saved ok') && polite.includes('FYI note') && !polite.includes('Broke badly'));
    assert.ok(assertive.includes('Broke badly') && !assertive.includes('Saved ok'));
  });

  it('renders identical messages as separate entries with distinct ids and their own labelled Close buttons', () => {
    const html = render([
      { id: 'a', type: 'success', message: 'Same' },
      { id: 'b', type: 'success', message: 'Same' },
      { id: 'c', type: 'error', message: 'Same' },
    ]);
    assert.equal((html.match(/data-notification-id="/g) ?? []).length, 3);
    for (const id of ['a', 'b', 'c']) assert.ok(html.includes(`data-notification-id="${id}"`));
    assert.equal((html.match(/aria-label="Close success notification"/g) ?? []).length, 2);
    assert.equal((html.match(/aria-label="Close error notification"/g) ?? []).length, 1);
  });

  it('is a fixed overlay above the z-50 dialogs', () => {
    const html = render([]);
    assert.match(html, /class="[^"]*\bfixed\b[^"]*\bz-\[100\]/);
  });

  it('the provider renders its children and exactly one viewport, and exposes the notifier to them', () => {
    const store = new NotificationStore(new FakeClock());
    const seen: string[] = [];
    const Probe = () => {
      const n = useNotifications();
      seen.push(...['notify', 'success', 'info', 'error', 'dismiss'].filter((k) => typeof (n as any)[k] === 'function'));
      return React.createElement('main', null, 'child content');
    };
    const html = renderToString(React.createElement(NotificationProvider, { store }, React.createElement(Probe)));
    assert.ok(html.includes('child content'));
    assert.equal((html.match(/data-notification-viewport/g) ?? []).length, 1);
    assert.deepEqual(seen, ['notify', 'success', 'info', 'error', 'dismiss']);
  });

  it('shows notifications already in the injected store', () => {
    const store = new NotificationStore(new FakeClock());
    store.notify('error', 'Failed to delete');
    const html = renderToString(React.createElement(NotificationProvider, { store }));
    assert.ok(html.includes('Failed to delete'));
  });

  it('useNotifications outside a provider fails loudly instead of silently dropping messages', () => {
    const Orphan = () => {
      useNotifications();
      return null;
    };
    assert.throws(() => renderToString(React.createElement(Orphan)), /NotificationProvider/);
  });
});

describe('Notification overlay: mounting and stacking (from the source)', () => {
  const root = join(__dirname, '../..');
  const webFiles: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx$/.test(name)) webFiles.push(p);
    }
  };
  walk(join(root, 'apps/web'));
  walk(join(root, 'app'));
  const providerFile = join(root, 'apps/web/components/ui/NotificationProvider.tsx');

  it('NotificationProvider is mounted exactly once, in the shared page that both layouts render', () => {
    const mounts = webFiles.filter((f) => f !== providerFile && /<NotificationProvider[\s>]/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(mounts.map((f) => f.replace(root + '/', '')), ['apps/web/app/page.tsx']);
    assert.equal(readFileSync(join(root, 'app/page.tsx'), 'utf8').includes("@/apps/web/app/page"), true);
  });

  it('only one fixed viewport exists and its z-index is above every other z-index in the web app', () => {
    const viewport = readFileSync(providerFile, 'utf8').match(/fixed[^"`]*\bz-\[(\d+)\]/);
    assert.ok(viewport, 'viewport z-index not found');
    const viewportZ = Number(viewport[1]);
    let otherMax = 0;
    for (const f of webFiles) {
      if (f === providerFile) continue;
      for (const m of readFileSync(f, 'utf8').matchAll(/\bz-(?:\[(\d+)\]|(\d+))\b/g)) otherMax = Math.max(otherMax, Number(m[1] ?? m[2]));
    }
    assert.equal(otherMax, 50, 'the dialogs use z-50; update this test if a higher layer is added');
    assert.ok(viewportZ > otherMax, `viewport z-${viewportZ} must be above z-${otherMax}`);
  });

  it('keeps the viewport inside both horizontal screen edges on narrow screens and keeps its desktop width', () => {
    const html = renderToString(
      React.createElement(NotificationViewport, { notifications: [], onDismiss() {}, onPause() {}, onResume() {} }),
    );
    const classes = (html.match(/data-notification-viewport="" class="([^"]*)"/)?.[1] ?? '').split(/\s+/);
    // Both logical edges are pinned 1rem in, so the box can never extend past either screen edge...
    assert.ok(classes.includes('start-4') && classes.includes('end-4'), `missing start-4/end-4: ${classes.join(' ')}`);
    // ...the previous maximum width and bottom-start position are preserved...
    assert.ok(classes.includes('max-w-sm') && classes.includes('bottom-4'));
    // ...and no explicit width can reintroduce the overflow (w-full + an inset is 100% + 1rem wide).
    assert.ok(!classes.some((c) => /^(?:w-|min-w-)/.test(c)), `explicit width found: ${classes.join(' ')}`);
    // Stacking is unchanged.
    assert.ok(classes.includes('fixed') && classes.includes('z-[100]'));
  });

  it('the provider clears all timers when it unmounts', () => {
    assert.match(readFileSync(providerFile, 'utf8'), /useEffect\(\(\) => \(\) => store\.dispose\(\), \[store\]\)/);
  });

  it('pauses the countdown while the pointer is over a notification or focus is inside it', () => {
    const src = readFileSync(providerFile, 'utf8');
    assert.match(src, /onMouseEnter=\{\(\) => setHovered\(true\)\}/);
    assert.match(src, /onFocus=\{\(\) => setFocused\(true\)\}/);
    assert.match(src, /if \(held\) onPause\(item\.id\);\s*else onResume\(item\.id\);/);
  });
});
