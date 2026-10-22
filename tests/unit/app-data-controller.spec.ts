/**
 * Regression tests for the shared app data controller (apps/web/lib/app-data-controller.ts).
 *
 * They protect against the refresh loop found in the Phase 1 audit: opening a proposal or switching term must
 * produce a bounded, predictable number of API requests, never a continuous stream.
 * No DOM is needed: the controller is plain TypeScript and the API is a counting fake.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AppDataController,
  classesMatchTerm,
  type AppDataApi,
} from '../../apps/web/lib/app-data-controller';
import type { AcademicTerm, ClassItem, Schedule, SchedulingProposal } from '../../apps/web/lib/api-client';

const T1: AcademicTerm = { id: 't1', name: 'T1', startDate: '2026-09-23', endDate: '2026-12-20', status: 'ACTIVE' };
const T2: AcademicTerm = { id: 't2', name: 'T2', startDate: '2026-12-22', endDate: '2027-03-15', status: 'PLANNED' };

function cls(id: string, term: string): ClassItem {
  return {
    id,
    academicTermId: term,
    bookId: 'b',
    bookSegmentId: null,
    teacherId: null,
    className: id,
    classType: 'REGULAR',
    status: 'ACTIVE',
    capacity: 10,
  };
}

function proposal(id: string, term: string, updatedAt = '2026-10-20T10:00:00Z'): SchedulingProposal {
  return {
    id,
    academicTermId: term,
    status: 'PENDING_REVIEW',
    data: { classes: [] } as unknown as SchedulingProposal['data'],
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt,
  };
}

interface Calls {
  terms: number;
  classes: Array<string | undefined>;
  schedules: number;
  proposals: Array<string | undefined>;
}

function fakeApi(over: Partial<AppDataApi> = {}) {
  const calls: Calls = { terms: 0, classes: [], schedules: 0, proposals: [] };
  const api: AppDataApi = {
    async getAcademicTerms() {
      calls.terms += 1;
      return [T1, T2];
    },
    async getClasses(f) {
      calls.classes.push(f.academicTermId);
      return f.academicTermId === 't2' ? [cls('c-t2', 't2')] : [cls('c-t1', 't1')];
    },
    async getSchedules() {
      calls.schedules += 1;
      return [] as Schedule[];
    },
    async getProposals(f) {
      calls.proposals.push(f.academicTermId);
      // A NEW object on every call, exactly like a freshly parsed HTTP response.
      return [proposal('p1', f.academicTermId ?? 't1')];
    },
    ...over,
  };
  return { api, calls };
}

const total = (c: Calls) => c.terms + c.classes.length + c.schedules + c.proposals.length;
const settle = () => new Promise((r) => setTimeout(r, 25));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AppDataController: no refresh loop', () => {
  it('one refresh performs exactly one round of requests and then stays idle', async () => {
    const { api, calls } = fakeApi();
    const c = new AppDataController(api, { isSupervisor: true });
    await c.refresh();
    await settle();
    assert.deepEqual(
      { terms: calls.terms, classes: calls.classes, schedules: calls.schedules, proposals: calls.proposals },
      { terms: 1, classes: ['t1'], schedules: 1, proposals: ['t1'] },
    );
  });

  it('opening a proposal sends no request, and refreshing with it open does one round and then stays idle', async () => {
    const { api, calls } = fakeApi();
    const c = new AppDataController(api, { isSupervisor: true });
    let notifications = 0;
    c.subscribe(() => {
      notifications += 1;
    });
    await c.refresh();
    const afterLoad = total(calls);

    c.setActiveProposal(c.getSnapshot().proposals[0]);
    await settle();
    assert.equal(total(calls), afterLoad, 'selecting a proposal must not fetch anything');

    const before = total(calls);
    await c.refresh();
    await settle();
    assert.equal(total(calls) - before, 4, 'one refresh = terms + classes + schedules + proposals');
    const notificationsAfterRefresh = notifications;
    await settle();
    assert.equal(notifications, notificationsAfterRefresh, 'no state changes after the refresh has settled');
    assert.equal(c.getSnapshot().activeProposal?.id, 'p1');
  });

  it('keeps the proposal under review up to date with fresh data without requesting more', async () => {
    let version = 'v1';
    const { api, calls } = fakeApi({
      async getProposals() {
        return [proposal('p1', 't1', version)];
      },
    });
    const c = new AppDataController(api, { isSupervisor: true });
    await c.refresh();
    c.setActiveProposal(c.getSnapshot().proposals[0]);
    version = 'v2';
    await c.refresh();
    assert.equal(c.getSnapshot().activeProposal?.updatedAt, 'v2');
    assert.equal(calls.terms, 2);
  });

  it('a proposal under review that is no longer listed is kept, not dropped', async () => {
    const { api } = fakeApi();
    const c = new AppDataController(api, { isSupervisor: true });
    await c.refresh();
    const standalone = proposal('gone', 't1');
    c.setActiveProposal(standalone);
    await c.refresh();
    assert.equal(c.getSnapshot().activeProposal?.id, 'gone');
  });
});

describe('AppDataController: term switching', () => {
  it('requests only the new term classes and proposals, once, and no terms or schedules', async () => {
    const { api, calls } = fakeApi();
    const c = new AppDataController(api, { isSupervisor: true });
    await c.refresh();
    const before = { terms: calls.terms, schedules: calls.schedules, classes: calls.classes.length, proposals: calls.proposals.length };

    await c.selectTerm(T2);
    await settle();
    assert.equal(calls.terms, before.terms);
    assert.equal(calls.schedules, before.schedules);
    assert.deepEqual(calls.classes.slice(before.classes), ['t2']);
    assert.deepEqual(calls.proposals.slice(before.proposals), ['t2']);

    const snap = c.getSnapshot();
    assert.equal(snap.activeTerm?.id, 't2');
    assert.equal(snap.classesTermId, 't2');
    assert.deepEqual(snap.classes.map((x) => x.id), ['c-t2']);
    assert.equal(classesMatchTerm(snap), true);
  });

  it('never shows the previous term data under the new term while loading', async () => {
    const slow = deferred<ClassItem[]>();
    const { api } = fakeApi({
      async getClasses(f) {
        return f.academicTermId === 't2' ? slow.promise : [cls('c-t1', 't1')];
      },
    });
    const c = new AppDataController(api, { isSupervisor: true });
    await c.refresh();
    assert.deepEqual(c.getSnapshot().classes.map((x) => x.id), ['c-t1']);

    const pending = c.selectTerm(T2);
    const during = c.getSnapshot();
    assert.equal(during.activeTerm?.id, 't2');
    assert.deepEqual(during.classes, [], 'old classes cleared immediately');
    assert.equal(during.classesTermId, null);
    assert.equal(classesMatchTerm(during), false);
    assert.equal(during.loading, true);

    slow.resolve([cls('c-t2', 't2')]);
    await pending;
    assert.equal(classesMatchTerm(c.getSnapshot()), true);
  });

  it('ignores a slow response for a term that is no longer selected', async () => {
    const slowT2 = deferred<ClassItem[]>();
    const { api } = fakeApi({
      async getClasses(f) {
        return f.academicTermId === 't2' ? slowT2.promise : [cls('c-t1', 't1')];
      },
    });
    const c = new AppDataController(api, { isSupervisor: true });
    await c.refresh();
    const toT2 = c.selectTerm(T2); // slow
    await c.selectTerm(T1); // newer selection finishes first
    slowT2.resolve([cls('late-t2', 't2')]);
    await toT2;
    const snap = c.getSnapshot();
    assert.equal(snap.activeTerm?.id, 't1');
    assert.deepEqual(snap.classes.map((x) => x.id), ['c-t1']);
  });

  it('selecting the already selected, fully loaded term does nothing', async () => {
    const { api, calls } = fakeApi();
    const c = new AppDataController(api, { isSupervisor: true });
    await c.refresh();
    const before = total(calls);
    await c.selectTerm(T1);
    assert.equal(total(calls), before);
  });

  it('a failed term switch is an error for the selected term; retry reloads that term, not the old one', async () => {
    let fail = true;
    const requested: Array<string | undefined> = [];
    const { api } = fakeApi({
      async getClasses(f) {
        requested.push(f.academicTermId);
        if (f.academicTermId === 't2' && fail) throw new Error('boom');
        return f.academicTermId === 't2' ? [cls('c-t2', 't2')] : [cls('c-t1', 't1')];
      },
    });
    const c = new AppDataController(api, { isSupervisor: true });
    await c.refresh();
    await c.selectTerm(T2);
    let snap = c.getSnapshot();
    assert.equal(snap.error, 'boom');
    assert.equal(snap.activeTerm?.id, 't2');
    assert.deepEqual(snap.classes, [], 'old term classes are not kept under the new term');
    assert.equal(classesMatchTerm(snap), false);

    fail = false;
    await c.refresh();
    snap = c.getSnapshot();
    assert.equal(snap.error, null);
    assert.equal(snap.activeTerm?.id, 't2');
    assert.deepEqual(snap.classes.map((x) => x.id), ['c-t2']);
    assert.equal(requested.at(-1), 't2', 'retry reloads the selected term');
  });
});

describe('AppDataController: errors, roles and sign-out', () => {
  it('a failed refresh keeps the same-term data, reports the error, and a later success clears it', async () => {
    let fail = false;
    const { api } = fakeApi({
      async getClasses(f) {
        if (fail) throw new Error('down');
        return [cls('c-t1', f.academicTermId ?? 't1')];
      },
    });
    const c = new AppDataController(api, { isSupervisor: true });
    await c.refresh();
    fail = true;
    await c.refresh();
    let snap = c.getSnapshot();
    assert.equal(snap.error, 'down');
    assert.equal(snap.loaded, true);
    assert.equal(classesMatchTerm(snap), true, 'last successful data of the same term is still attributed to it');
    fail = false;
    await c.refresh();
    snap = c.getSnapshot();
    assert.equal(snap.error, null);
  });

  it('a failure on the very first load is an error, not an empty term', async () => {
    const { api } = fakeApi({
      async getClasses() {
        throw new Error('500');
      },
    });
    const c = new AppDataController(api, { isSupervisor: true });
    await c.refresh();
    const snap = c.getSnapshot();
    assert.equal(snap.error, '500');
    assert.equal(snap.loaded, true);
    assert.equal(snap.activeTerm, null);
    assert.equal(classesMatchTerm(snap), false);
  });

  it('setSupervisor switches the role without any request', async () => {
    const { api, calls } = fakeApi();
    const c = new AppDataController(api);
    c.setSupervisor(true);
    assert.equal(total(calls), 0);
    await c.refresh();
    assert.deepEqual(calls.proposals, ['t1']);
  });

  it('does not call the supervisor-only proposals endpoint for a teacher', async () => {
    const { api, calls } = fakeApi();
    const c = new AppDataController(api, { isSupervisor: false });
    await c.refresh();
    await c.selectTerm(T2);
    assert.deepEqual(calls.proposals, []);
    assert.deepEqual(c.getSnapshot().proposals, []);
  });

  it('reset clears everything and discards responses that arrive afterwards', async () => {
    const slow = deferred<ClassItem[]>();
    const { api } = fakeApi({
      async getClasses() {
        return slow.promise;
      },
    });
    const c = new AppDataController(api, { isSupervisor: true });
    const pending = c.refresh();
    await settle();
    c.reset();
    slow.resolve([cls('late', 't1')]);
    await pending;
    const snap = c.getSnapshot();
    assert.equal(snap.loaded, false);
    assert.deepEqual(snap.classes, []);
    assert.equal(snap.activeTerm, null);
  });
});
