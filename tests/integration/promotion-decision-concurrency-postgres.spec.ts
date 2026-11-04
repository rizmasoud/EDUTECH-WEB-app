/**
 * Real-PostgreSQL concurrency tests for PromotionService.decidePromotion.
 *
 * Why this file exists: the PGlite promotion tests run on one connection, so concurrent requests are
 * serialized by the driver and can never exercise row locks or the conditional UPDATE. Here every actor
 * has its OWN PostgreSQL connection (separate backend process), and ordering is established by observing
 * PostgreSQL itself (pg_blocking_pids), not by sleeping.
 *
 * SAFE BY CONSTRUCTION (same rules as db-migrate-postgres.spec.ts)
 *  - Runs ONLY when EDUTECH_TEST_PG_ADMIN_URL is set, and refuses a non-loopback host, a URL equal to
 *    DATABASE_URL, or NODE_ENV=production. Without the variable the whole file is skipped; it never falls
 *    back to DATABASE_URL and the admin URL is never printed.
 *  - The server must identify itself as real PostgreSQL (version() check), not an emulator.
 *  - One migrated TEMPLATE database is created per run; every scenario clones its own database from it.
 *    Only databases this file created (tracked by exact name) are ever dropped, in `after`.
 *
 * HOW A DECISION IS PAUSED DETERMINISTICALLY
 *  decidePromotion locks, in this order: promotion, exam result, exam, class, source book, then every
 *  currently eligible next book in sequence order. A "holder" connection first locks a row that comes
 *  LATER in that order (the source book, or the last eligible book). The decision then blocks on it while
 *  already holding the earlier locks. The test confirms the wait with pg_blocking_pids, lets a "writer"
 *  connection attempt a conflicting change, confirms the writer is blocked BY the decision's backend, and
 *  only then releases the holder.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { and, eq } from 'drizzle-orm';
import type { AuthUser } from '@edutech/shared';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { accounts } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { teachers } from '../../apps/api/src/infrastructure/database/schema/teachers.schema';
import { students } from '../../apps/api/src/infrastructure/database/schema/students.schema';
import { academicTerms, books } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { classes } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
import { exams, examResults, promotions } from '../../apps/api/src/infrastructure/database/schema/education.schema';
import { auditLogs } from '../../apps/api/src/infrastructure/database/schema/system.schema';
import { PromotionService } from '../../apps/api/src/education/application/services/promotion.service';

const ADMIN_URL = process.env.EDUTECH_TEST_PG_ADMIN_URL?.trim();
const migrationsDir = path.resolve(__dirname, '../../apps/api/drizzle');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function assertSafeAdminUrl(raw: string): URL {
  const u = new URL(raw);
  assert.ok(/^postgres(ql)?:$/.test(u.protocol), 'EDUTECH_TEST_PG_ADMIN_URL must be a postgres URL');
  assert.ok(LOOPBACK.has(u.hostname), 'EDUTECH_TEST_PG_ADMIN_URL must point at a loopback host (disposable server)');
  assert.notEqual(raw, process.env.DATABASE_URL?.trim(), 'refusing to run: the admin URL equals DATABASE_URL');
  assert.notEqual(process.env.NODE_ENV?.toLowerCase().trim(), 'production', 'refusing to run in production');
  return u;
}
function urlForDb(admin: URL, db: string): string {
  const u = new URL(admin.toString());
  u.pathname = `/${db}`;
  return u.toString();
}

const skipReason = ADMIN_URL
  ? undefined
  : 'EDUTECH_TEST_PG_ADMIN_URL is not set: real-PostgreSQL promotion concurrency test skipped (never falls back to DATABASE_URL)';

// Bounds a hung scenario into a failure instead of a hung suite (every connection also gets lock_timeout).
const SCENARIO_TIMEOUT_MS = 60_000;
const WAIT_TIMEOUT_MS = 15_000;

class RollbackSignal extends Error {}

interface Held {
  /** Resolves once the transaction has run its statements and is holding its locks. */
  acquired: Promise<void>;
  /** Ends the transaction and resolves when PostgreSQL has finished it. */
  release: (mode: 'commit' | 'rollback') => Promise<void>;
}

describe('decidePromotion on a real PostgreSQL server (independent connections, disposable databases only)', { skip: skipReason }, () => {
  let admin: URL;
  let adminSql: postgres.Sql | undefined;
  let templateDb = '';
  const created: string[] = [];
  const openClients = new Set<postgres.Sql>();
  const scenarioClients = new Set<postgres.Sql>(); // connections opened by the current scenario
  const activeHolds = new Set<Held>(); // holder transactions opened by the current scenario

  before(async () => {
    admin = assertSafeAdminUrl(ADMIN_URL as string);
    adminSql = postgres(admin.toString(), { max: 1, onnotice: () => {} });

    // Prove this is a real PostgreSQL server (not an emulator or a lookalike).
    const [v] = await adminSql`select version() as v, current_setting('server_version_num')::int as num`;
    assert.match(String(v.v), /^PostgreSQL \d+/, 'the test server must identify itself as PostgreSQL');
    assert.ok(Number(v.num) >= 120000, 'PostgreSQL 12 or newer is required (pg_blocking_pids, FOR UPDATE semantics)');
    console.log(`  real PostgreSQL server_version_num=${v.num} (connection details not logged)`);

    // One migrated template; every scenario clones it (fast, fully isolated).
    templateDb = `edutech_promo_conc_tpl_${randomBytes(4).toString('hex')}`;
    assert.match(templateDb, /^[a-z0-9_]+$/);
    await adminSql.unsafe(`CREATE DATABASE ${templateDb}`);
    created.push(templateDb);
    const migrator = postgres(urlForDb(admin, templateDb), { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(migrator), { migrationsFolder: migrationsDir });
    } finally {
      await migrator.end({ timeout: 5 });
    }
  });

  // Failure-path hygiene: a failed assertion must not leave a holder transaction (and its locks) open or leak
  // connections into later scenarios.
  afterEach(async () => {
    for (const h of activeHolds) await h.release('rollback').catch(() => {});
    activeHolds.clear();
    for (const c of scenarioClients) {
      openClients.delete(c);
      await c.end({ timeout: 2 }).catch(() => {});
    }
    scenarioClients.clear();
  });

  after(async () => {
    const failures: string[] = [];
    try {
      for (const c of openClients) await c.end({ timeout: 2 }).catch(() => {});
    } finally {
      if (adminSql) {
        for (const db of created) {
          try {
            await adminSql.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
          } catch (e) {
            failures.push(`${db}: ${(e as Error).message}`);
          }
        }
        await adminSql.end({ timeout: 2 }).catch(() => {});
      }
    }
    if (failures.length) throw new Error(`could not drop temporary database(s): ${failures.join('; ')}`);
  });

  // ---------------------------------------------------------------------------------------------
  // Per-scenario fixture: its own database cloned from the template, plus named connections.
  // ---------------------------------------------------------------------------------------------
  interface Actor {
    sql: postgres.Sql;
    pid: number;
  }
  interface Fixture {
    dbName: string;
    db: any; // control connection (assertions and seeding), never holds locks across awaits
    ctl: postgres.Sql;
    actor: (name: string) => Promise<Actor>;
    service: (name: string) => Promise<{ svc: PromotionService; actor: Actor }>;
    ids: {
      supervisorAccountId: string;
      teacherAAccountId: string;
      teacherBAccountId: string;
      teacherAId: string;
      teacherBId: string;
      classId: string;
      examId: string;
      resultId: string;
      promotionId: string;
      studentId: string;
      book1: string;
      book2: string;
      book3: string;
    };
    users: { supervisor: AuthUser; teacherA: AuthUser; teacherB: AuthUser };
  }

  async function newFixture(label: string, opts: { score?: string } = {}): Promise<Fixture> {
    const dbName = `edutech_promo_conc_${label}_${randomBytes(4).toString('hex')}`;
    assert.match(dbName, /^[a-z0-9_]+$/);
    await (adminSql as postgres.Sql).unsafe(`CREATE DATABASE ${dbName} TEMPLATE ${templateDb}`);
    created.push(dbName);
    const url = urlForDb(admin, dbName);

    const connect = (appName: string) => {
      const c = postgres(url, {
        max: 1,
        onnotice: () => {},
        connection: { application_name: appName, lock_timeout: 20_000 },
      });
      openClients.add(c);
      scenarioClients.add(c);
      return c;
    };
    const ctl = connect('ctl');
    const [cur] = await ctl`select current_database() as d`;
    assert.equal(cur.d, dbName, 'control connection must be on the scenario database');
    const db = drizzle(ctl, { schema });

    const actor = async (name: string): Promise<Actor> => {
      const sql = connect(name);
      const [p] = await sql`select pg_backend_pid() as pid`;
      return { sql, pid: Number(p.pid) };
    };
    const service = async (name: string) => {
      const a = await actor(name);
      return { svc: new PromotionService(drizzle(a.sql, { schema })), actor: a };
    };

    // ---- seed ----
    const [sup] = await db.insert(accounts).values({ personnelCode: 'SUP-01', passwordHash: 'x', isActive: true }).returning();
    const [accA] = await db.insert(accounts).values({ personnelCode: 'TCH-01', passwordHash: 'x', isActive: true }).returning();
    const [accB] = await db.insert(accounts).values({ personnelCode: 'TCH-02', passwordHash: 'x', isActive: true }).returning();
    const [tA] = await db.insert(teachers).values({ accountId: accA.id, firstName: 'Alice', lastName: 'A', isActive: true }).returning();
    const [tB] = await db.insert(teachers).values({ accountId: accB.id, firstName: 'Bob', lastName: 'B', isActive: true }).returning();
    const [term] = await db
      .insert(academicTerms)
      .values({ name: 'Conc Term', startDate: '2026-06-01', endDate: '2026-08-31', status: 'ACTIVE' })
      .returning();
    // Book chain with gaps in sequenceOrder; book 3 is terminal.
    const mkBook = async (name: string, seq: number, terminal: boolean, active = true) =>
      (
        await db
          .insert(books)
          .values({ name, level: 'A1', sequenceOrder: seq, sessionCount: 20, isTerminal: terminal, isActive: active })
          .returning()
      )[0].id as string;
    const book1 = await mkBook('Book 1', 10, false);
    const book2 = await mkBook('Book 2', 30, false);
    const book3 = await mkBook('Book 3', 40, true);
    const [cls] = await db
      .insert(classes)
      .values({ academicTermId: term.id, bookId: book1, teacherId: tA.id, classType: 'REGULAR', status: 'ACTIVE', capacity: 12 })
      .returning();
    const [student] = await db.insert(students).values({ firstName: 'Stu', lastName: 'Dent' }).returning();
    const [exam] = await db.insert(exams).values({ classId: cls.id, examDate: '2026-06-20', type: 'FINAL' }).returning();
    const [result] = await db
      .insert(examResults)
      .values({ examId: exam.id, studentId: student.id, score: opts.score ?? '65.00' })
      .returning();
    const [promo] = await db
      .insert(promotions)
      .values({ studentId: student.id, fromBookId: book1, examResultId: result.id, status: 'PENDING_DECISION' })
      .returning();

    const user = (id: string, roles: AuthUser['roles'], teacherId: string | null, code: string): AuthUser => ({
      id,
      personnelCode: code,
      isActive: true,
      roles,
      teacherId,
    });
    return {
      dbName,
      db,
      ctl,
      actor,
      service,
      ids: {
        supervisorAccountId: sup.id,
        teacherAAccountId: accA.id,
        teacherBAccountId: accB.id,
        teacherAId: tA.id,
        teacherBId: tB.id,
        classId: cls.id,
        examId: exam.id,
        resultId: result.id,
        promotionId: promo.id,
        studentId: student.id,
        book1,
        book2,
        book3,
      },
      users: {
        supervisor: user(sup.id, ['SUPERVISOR'], null, 'SUP-01'),
        teacherA: user(accA.id, ['TEACHER'], tA.id, 'TCH-01'),
        teacherB: user(accB.id, ['TEACHER'], tB.id, 'TCH-02'),
      },
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Synchronization helpers
  // ---------------------------------------------------------------------------------------------

  /** Run `work` in a transaction on `actor` and keep it open (holding its locks) until released. */
  function hold(actor: Actor, work: (tx: postgres.TransactionSql) => Promise<unknown>): Held {
    let open!: () => void;
    let fail!: (e: unknown) => void;
    const acquired = new Promise<void>((res, rej) => {
      open = res;
      fail = rej;
    });
    let finish!: (mode: 'commit' | 'rollback') => void;
    const gate = new Promise<'commit' | 'rollback'>((res) => {
      finish = res;
    });
    const done = actor.sql
      .begin(async (tx) => {
        try {
          await work(tx);
        } catch (e) {
          fail(e);
          throw e;
        }
        open();
        if ((await gate) === 'rollback') throw new RollbackSignal();
      })
      .then(
        () => undefined,
        (e) => {
          if (!(e instanceof RollbackSignal)) throw e;
        },
      );
    done.catch(() => {}); // a failed `work` is reported through `acquired`; avoid an unhandled rejection
    const held: Held = {
      acquired,
      release: (mode) => {
        finish(mode);
        return done;
      },
    };
    activeHolds.add(held);
    return held;
  }

  /**
   * Wait until PostgreSQL itself reports that `waiterPid` is blocked by `blockerPid`
   * (pg_blocking_pids). This is observation of real lock state, not a timing guess.
   */
  async function waitBlockedBy(ctl: postgres.Sql, waiter: Actor, blocker: Actor, what: string): Promise<void> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    let last = '';
    for (;;) {
      const [r] = await ctl`select pg_blocking_pids(${waiter.pid}::int) as b`;
      const blockers = (r.b as number[]) ?? [];
      last = JSON.stringify(blockers);
      if (blockers.includes(blocker.pid)) return;
      if (Date.now() > deadline) {
        throw new Error(
          `timed out waiting for ${what}: pid ${waiter.pid} is blocked by ${last}, expected pid ${blocker.pid}`,
        );
      }
      await new Promise((r2) => setTimeout(r2, 15)); // poll interval only; ordering comes from pg_blocking_pids
    }
  }

  /** Track whether a promise has settled without awaiting it. */
  function track<T>(p: Promise<T>): { p: Promise<T>; settled: () => boolean } {
    let s = false;
    const wrapped = p.finally(() => {
      s = true;
    });
    wrapped.catch(() => {}); // avoid an unhandled rejection before the test awaits it
    return { p: wrapped, settled: () => s };
  }

  const lockRow = (table: 'books' | 'exam_results' | 'classes', id: string) => (tx: postgres.TransactionSql) =>
    tx.unsafe(`select id from ${table} where id = $1 for update`, [id]);

  const decisionAudits = async (f: Fixture, promotionId = f.ids.promotionId) =>
    f.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, promotionId), eq(auditLogs.action, 'UPDATE_PROMOTION')));
  const promotionRow = async (f: Fixture) =>
    (await f.db.select().from(promotions).where(eq(promotions.id, f.ids.promotionId)))[0];

  const T = { timeout: SCENARIO_TIMEOUT_MS };

  // ---------------------------------------------------------------------------------------------
  // 1. Score changes vs. a decision holding the lock
  // ---------------------------------------------------------------------------------------------

  it('1a. A score update cannot commit while the decision holds the exam-result lock; the decision uses the score it validated', T, async () => {
    const f = await newFixture('score');
    const holder = await f.actor('holder');
    const writer = await f.actor('writer_score');
    const { svc, actor: dec } = await f.service('decision');

    const h = hold(holder, lockRow('books', f.ids.book1)); // pauses the decision AFTER it took the result lock
    await h.acquired;
    const decision = track(svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE' }, f.users.teacherA));
    await waitBlockedBy(f.ctl, dec, holder, 'decision to reach the source-book lock');

    // The writer tries to change the score the decision already validated (65 -> 95).
    const update = track(
      writer.sql`update exam_results set score = '95.00' where id = ${f.ids.resultId}`.then(() => undefined),
    );
    await waitBlockedBy(f.ctl, writer, dec, 'score update to block on the decision');
    assert.equal(update.settled(), false);
    assert.equal(decision.settled(), false);
    const [mid] = await f.ctl`select score from exam_results where id = ${f.ids.resultId}`;
    assert.equal(mid.score, '65.00', 'the score must be unchanged while the decision holds the lock');

    await h.release('rollback');
    const decided = await decision.p;
    assert.equal(decided.status, 'PROMOTED');
    await update.p; // the writer proceeds only after the decision committed
    const [end] = await f.ctl`select score from exam_results where id = ${f.ids.resultId}`;
    assert.equal(end.score, '95.00');
    assert.equal((await decisionAudits(f)).length, 1);
  });

  it('1b. A score update committed while the decision waits is observed: a teacher decision on a now-70+ score is rejected', T, async () => {
    const f = await newFixture('score_visible');
    const writer = await f.actor('writer_score');
    const { svc, actor: dec } = await f.service('decision');

    const w = hold(writer, (tx) =>
      tx`update exam_results set score = '75.00' where id = ${f.ids.resultId}`,
    );
    await w.acquired; // uncommitted update holding the row lock
    const decision = track(svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE' }, f.users.teacherA));
    await waitBlockedBy(f.ctl, dec, writer, 'decision to wait for the uncommitted score update');
    await w.release('commit');

    await assert.rejects(decision.p, (e: any) => {
      assert.equal(e.getStatus(), 400);
      assert.equal(e.getResponse().code, 'INVALID_INPUT');
      return true;
    });
    const row = await promotionRow(f);
    assert.equal(row.status, 'PENDING_DECISION');
    assert.equal(row.decision, null);
    assert.equal((await decisionAudits(f)).length, 0);
  });

  // ---------------------------------------------------------------------------------------------
  // 2. Class ownership changes vs. a decision in progress
  // ---------------------------------------------------------------------------------------------

  it('2a. Teacher ownership cannot change while the decision holds the class lock; the decision stays valid for the validated owner', T, async () => {
    const f = await newFixture('owner');
    const holder = await f.actor('holder');
    const writer = await f.actor('writer_owner');
    const { svc, actor: dec } = await f.service('decision');

    const h = hold(holder, lockRow('books', f.ids.book1));
    await h.acquired;
    const decision = track(svc.decidePromotion(f.ids.promotionId, { decision: 'REPEAT' }, f.users.teacherA));
    await waitBlockedBy(f.ctl, dec, holder, 'decision to reach the source-book lock');

    const reassign = track(
      writer.sql`update classes set teacher_id = ${f.ids.teacherBId} where id = ${f.ids.classId}`.then(() => undefined),
    );
    await waitBlockedBy(f.ctl, writer, dec, 'class reassignment to block on the decision');
    const [mid] = await f.ctl`select teacher_id from classes where id = ${f.ids.classId}`;
    assert.equal(mid.teacher_id, f.ids.teacherAId, 'ownership must be unchanged while the decision holds the lock');

    await h.release('rollback');
    // The response is built inside the decision transaction, so the former owner gets the result even though
    // the reassignment commits the moment the decision does.
    const decided = await decision.p;
    assert.equal(decided.status, 'NOT_PROMOTED');
    assert.equal(decided.decidedBy, f.ids.teacherAAccountId);
    await reassign.p;
    const [end] = await f.ctl`select teacher_id from classes where id = ${f.ids.classId}`;
    assert.equal(end.teacher_id, f.ids.teacherBId);

    // The decision itself was validated against the owner at lock time and persisted atomically.
    const row = await promotionRow(f);
    assert.equal(row.status, 'NOT_PROMOTED');
    assert.equal(row.decision, 'REPEAT');
    assert.equal(row.decidedBy, f.ids.teacherAAccountId);
    const audits = await decisionAudits(f);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actorAccountId, f.ids.teacherAAccountId);
  });

  it('2b. An ownership change committed while the decision waits is observed: the former owner gets 403 and nothing is written', T, async () => {
    const f = await newFixture('owner_visible');
    const writer = await f.actor('writer_owner');
    const { svc, actor: dec } = await f.service('decision');

    const w = hold(writer, (tx) =>
      tx`update classes set teacher_id = ${f.ids.teacherBId} where id = ${f.ids.classId}`,
    );
    await w.acquired;
    const decision = track(svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE' }, f.users.teacherA));
    await waitBlockedBy(f.ctl, dec, writer, 'decision to wait for the uncommitted class reassignment');
    await w.release('commit');

    await assert.rejects(decision.p, (e: any) => {
      assert.equal(e.getStatus(), 403);
      assert.equal(e.getResponse().code, 'FORBIDDEN_RESOURCE');
      return true;
    });
    const row = await promotionRow(f);
    assert.equal(row.status, 'PENDING_DECISION');
    assert.equal((await decisionAudits(f)).length, 0);
  });

  // ---------------------------------------------------------------------------------------------
  // 3 + 4. Two simultaneous decisions: exactly one wins, exactly one audit event
  // ---------------------------------------------------------------------------------------------

  it('3/4. Two simultaneous decisions on separate connections: exactly one succeeds and exactly one matching audit event is persisted', T, async () => {
    const f = await newFixture('double');
    const holder = await f.actor('holder');
    const first = await f.service('decision_1');
    const second = await f.service('decision_2');

    const h = hold(holder, lockRow('books', f.ids.book1));
    await h.acquired;
    const d1 = track(first.svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE', reason: 'first' }, f.users.teacherA));
    await waitBlockedBy(f.ctl, first.actor, holder, 'first decision to hold the promotion lock and wait at the source book');
    const d2 = track(second.svc.decidePromotion(f.ids.promotionId, { decision: 'REPEAT', reason: 'second' }, f.users.supervisor));
    await waitBlockedBy(f.ctl, second.actor, first.actor, 'second decision to wait on the first decision\'s promotion lock');
    assert.equal(d1.settled(), false);
    assert.equal(d2.settled(), false);

    await h.release('rollback');
    const settled = await Promise.allSettled([d1.p, d2.p]);
    assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 1, 'exactly one decision may succeed');
    assert.equal(settled.filter((s) => s.status === 'rejected').length, 1);

    // The first decision took the promotion lock first, so it is the winner.
    assert.equal(settled[0].status, 'fulfilled');
    assert.equal(settled[1].status, 'rejected');
    const loser = (settled[1] as PromiseRejectedResult).reason as any;
    assert.equal(loser.getStatus(), 400);
    assert.equal(loser.getResponse().code, 'INVALID_INPUT');
    // This message comes from the status check after the promotion lock (re-read of the committed row). The
    // conditional-UPDATE fallback uses a different message, so removing the promotion lock fails this assertion.
    assert.match(loser.getResponse().message, /already finalized promotion with status PROMOTED/i);

    const row = await promotionRow(f);
    assert.equal(row.status, 'PROMOTED');
    assert.equal(row.decision, 'PROMOTE');
    assert.equal(row.decidedBy, f.ids.teacherAAccountId);
    assert.equal(row.toBookId, f.ids.book2);

    const audits = await decisionAudits(f);
    assert.equal(audits.length, 1, 'exactly one audit event');
    assert.equal(audits[0].actorAccountId, f.ids.teacherAAccountId);
    assert.equal((audits[0].metadata as any).decision, 'PROMOTE');
    assert.equal((audits[0].metadata as any).reason, 'first');
    assert.equal((audits[0].metadata as any).previousStatus, 'PENDING_DECISION');
    assert.equal((audits[0].metadata as any).toBookId, f.ids.book2);
  });

  it('3/4b. Without any pre-arranged ordering, a burst of competing decisions still yields one winner and one audit event', T, async () => {
    const f = await newFixture('burst');
    const actors = await Promise.all([1, 2, 3, 4].map((n) => f.service(`burst_${n}`)));
    const callers = [f.users.teacherA, f.users.supervisor, f.users.teacherA, f.users.supervisor];
    const decisions = ['PROMOTE', 'REPEAT', 'DO_NOT_PROMOTE', 'REMEDIAL'] as const;

    const settled = await Promise.allSettled(
      actors.map((a, i) => a.svc.decidePromotion(f.ids.promotionId, { decision: decisions[i] }, callers[i])),
    );
    const wins = settled.flatMap((s, i) => (s.status === 'fulfilled' ? [i] : []));
    assert.equal(wins.length, 1, 'exactly one decision may succeed');
    for (const s of settled) {
      if (s.status === 'rejected') {
        const e = s.reason as any;
        assert.equal(e.getStatus(), 400, 'a loser must get the established invalid-state response, not a DB error');
        assert.equal(e.getResponse().code, 'INVALID_INPUT');
      }
    }
    const row = await promotionRow(f);
    assert.equal(row.decision, decisions[wins[0]]);
    const audits = await decisionAudits(f);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actorAccountId, callers[wins[0]].id);
  });

  // ---------------------------------------------------------------------------------------------
  // 5. Eligible next books vs. the decision transaction
  // ---------------------------------------------------------------------------------------------

  it('5a. The next book chosen by the decision is locked until commit: a concurrent deactivation waits and applies afterwards', T, async () => {
    const f = await newFixture('book_lock');
    const holder = await f.actor('holder');
    const writer = await f.actor('writer_book');
    const { svc, actor: dec } = await f.service('decision');

    // The holder owns the LAST eligible book, so the decision locks book 2 and then waits on book 3.
    const h = hold(holder, lockRow('books', f.ids.book3));
    await h.acquired;
    const decision = track(svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE' }, f.users.teacherA));
    await waitBlockedBy(f.ctl, dec, holder, 'decision to wait for the last eligible book');

    const deactivate = track(
      writer.sql`update books set is_active = false where id = ${f.ids.book2}`.then(() => undefined),
    );
    await waitBlockedBy(f.ctl, writer, dec, 'deactivation of the chosen next book to block on the decision');
    const [mid] = await f.ctl`select is_active from books where id = ${f.ids.book2}`;
    assert.equal(mid.is_active, true);

    await h.release('rollback');
    const decided = await decision.p;
    assert.equal(decided.toBookId, f.ids.book2, 'the decision recorded the next book it locked');
    await deactivate.p;
    const [end] = await f.ctl`select is_active from books where id = ${f.ids.book2}`;
    assert.equal(end.is_active, false, 'the deactivation is applied only after the decision committed');
    assert.equal((await decisionAudits(f)).length, 1);
  });

  it('5b. A next-book change committed while the decision waits is observed: the decision picks the following eligible book', T, async () => {
    const f = await newFixture('book_visible');
    const writer = await f.actor('writer_book');
    const { svc, actor: dec } = await f.service('decision');

    const w = hold(writer, (tx) => tx`update books set is_active = false where id = ${f.ids.book2}`);
    await w.acquired;
    const decision = track(svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE' }, f.users.supervisor));
    await waitBlockedBy(f.ctl, dec, writer, 'decision to wait for the uncommitted book deactivation');
    await w.release('commit');

    const decided = await decision.p;
    assert.equal(decided.status, 'PROMOTED');
    assert.equal(decided.toBookId, f.ids.book3, 'book 2 became ineligible before the decision locked it');
    const audits = await decisionAudits(f);
    assert.equal(audits.length, 1);
    assert.equal((audits[0].metadata as any).toBookId, f.ids.book3);
  });

  it('5c. DOCUMENTED LIMITATION: activating a book that was NOT eligible is not blocked (no row to lock); it serializes after the decision', T, async () => {
    const f = await newFixture('book_phantom');
    const holder = await f.actor('holder');
    const writer = await f.actor('writer_book');
    const { svc, actor: dec } = await f.service('decision');
    // An inactive book that, once active, would sit between book 1 (10) and book 2 (30).
    const [between] = await f.db
      .insert(books)
      .values({ name: 'Between', level: 'A1', sequenceOrder: 20, sessionCount: 20, isTerminal: false, isActive: false })
      .returning();

    const h = hold(holder, lockRow('books', f.ids.book3));
    await h.acquired;
    const decision = track(svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE' }, f.users.teacherA));
    await waitBlockedBy(f.ctl, dec, holder, 'decision to wait for the last eligible book');

    // FOR UPDATE can only lock rows that exist in the eligible set: this write is NOT blocked by the decision.
    await writer.sql`update books set is_active = true where id = ${between.id}`;
    assert.equal(decision.settled(), false, 'the decision is still in progress when the activation committed');

    await h.release('rollback');
    const decided = await decision.p;
    // The decision used the eligible set it read before the activation (serial order: decision, then activation).
    assert.equal(decided.toBookId, f.ids.book2);
    assert.equal((await decisionAudits(f)).length, 1);
  });

  it('1c. An exam cannot be moved to another class while the decision holds the exam lock', T, async () => {
    const f = await newFixture('exam_lock');
    const holder = await f.actor('holder');
    const writer = await f.actor('writer_exam');
    const { svc, actor: dec } = await f.service('decision');
    const [term] = await f.db.select().from(academicTerms).limit(1);
    const [otherClass] = await f.db
      .insert(classes)
      .values({ academicTermId: term.id, bookId: f.ids.book1, teacherId: f.ids.teacherBId, classType: 'REGULAR', status: 'ACTIVE', capacity: 12 })
      .returning();

    const h = hold(holder, lockRow('books', f.ids.book1));
    await h.acquired;
    const decision = track(svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE' }, f.users.teacherA));
    await waitBlockedBy(f.ctl, dec, holder, 'decision to reach the source-book lock');

    const move = track(
      writer.sql`update exams set class_id = ${otherClass.id} where id = ${f.ids.examId}`.then(() => undefined),
    );
    await waitBlockedBy(f.ctl, writer, dec, 'exam move to block on the decision');
    const [mid] = await f.ctl`select class_id from exams where id = ${f.ids.examId}`;
    assert.equal(mid.class_id, f.ids.classId, 'the exam must stay in the validated class while the decision runs');

    await h.release('rollback');
    assert.equal((await decision.p).status, 'PROMOTED');
    await move.p;
    const [end] = await f.ctl`select class_id from exams where id = ${f.ids.examId}`;
    assert.equal(end.class_id, otherClass.id, 'the move is applied only after the decision committed');
  });

  it('5d. The source book cannot change (terminal flag) while the decision holds its lock', T, async () => {
    const f = await newFixture('from_book_lock');
    const holder = await f.actor('holder');
    const writer = await f.actor('writer_book');
    const { svc, actor: dec } = await f.service('decision');

    // The holder owns the LAST eligible book: the decision has already locked the source book and book 2.
    const h = hold(holder, lockRow('books', f.ids.book3));
    await h.acquired;
    const decision = track(svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE' }, f.users.teacherA));
    await waitBlockedBy(f.ctl, dec, holder, 'decision to wait for the last eligible book');

    const flip = track(
      writer.sql`update books set is_terminal = true where id = ${f.ids.book1}`.then(() => undefined),
    );
    await waitBlockedBy(f.ctl, writer, dec, 'source-book update to block on the decision');
    const [mid] = await f.ctl`select is_terminal from books where id = ${f.ids.book1}`;
    assert.equal(mid.is_terminal, false);

    await h.release('rollback');
    const decided = await decision.p;
    assert.equal(decided.toBookId, f.ids.book2, 'the decision used the non-terminal source book it locked');
    await flip.p;
    const [end] = await f.ctl`select is_terminal from books where id = ${f.ids.book1}`;
    assert.equal(end.is_terminal, true);
  });

  it('6. Lock strength: an open decision blocks every UPDATE of what it validated but not inserts of child rows', T, async () => {
    const f = await newFixture('strength');
    const holder = await f.actor('holder');
    const { svc, actor: dec } = await f.service('decision');
    const [term] = await f.db.select().from(academicTerms).limit(1);
    const [other] = await f.db.insert(students).values({ firstName: 'Other', lastName: 'Student' }).returning();

    const h = hold(holder, lockRow('books', f.ids.book3));
    await h.acquired;
    const decision = track(svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE' }, f.users.teacherA));
    await waitBlockedBy(f.ctl, dec, holder, 'decision to wait for the last eligible book');

    // Each insert only REFERENCES a row the decision locked (class, exam, book). With a 3 s lock_timeout a blocked
    // insert fails with 55P03 instead of hanging, so this assertion cannot pass by accident.
    const child = async (name: string, run: (sql: postgres.Sql) => Promise<unknown>) => {
      const a = await f.actor(name);
      await a.sql.unsafe(`set lock_timeout = '3s'`);
      await run(a.sql);
    };
    await child('child_enrollment', (q) => q`insert into enrollments (class_id, student_id, status) values (${f.ids.classId}, ${other.id}, 'ACTIVE')`);
    await child('child_exam_result', (q) => q`insert into exam_results (exam_id, student_id, score) values (${f.ids.examId}, ${other.id}, '50.00')`);
    await child('child_exam', (q) => q`insert into exams (class_id, exam_date, type) values (${f.ids.classId}, '2026-07-01', 'MIDTERM')`);
    await child('child_class', (q) => q`insert into classes (academic_term_id, book_id, teacher_id, class_type, status, capacity) values (${term.id}, ${f.ids.book2}, ${f.ids.teacherAId}, 'REGULAR', 'DRAFT', 5)`);
    assert.equal(decision.settled(), false, 'the decision must still be in progress while the inserts committed');

    await h.release('rollback');
    assert.equal((await decision.p).status, 'PROMOTED');
    assert.equal((await decisionAudits(f)).length, 1);
  });

  it('7. A failure after the promotion update rolls everything back and releases the locks', T, async () => {
    const f = await newFixture('rollback');
    const { svc } = await f.service('decision');
    // Make the audit insert (the LAST write of the transaction) fail, after the promotion UPDATE succeeded.
    await f.ctl.unsafe(`
      create function pg_temp_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'audit_insert_blocked'; end $$;
    `);
    await f.ctl.unsafe(`create trigger fail_audit before insert on audit_logs for each row execute function pg_temp_fail_audit()`);

    await assert.rejects(svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE' }, f.users.teacherA), /audit_insert_blocked/);
    const row = await promotionRow(f);
    assert.equal(row.status, 'PENDING_DECISION');
    assert.equal(row.decision, null);
    assert.equal(row.decidedBy, null);
    assert.equal(row.toBookId, null);
    assert.equal((await decisionAudits(f)).length, 0, 'no partial write: neither the update nor an audit row survives');

    // Locks were released by the rollback: a later decision succeeds immediately (lock_timeout would fail it).
    await f.ctl.unsafe(`drop trigger fail_audit on audit_logs`);
    const retry = await f.service('decision_retry');
    const decided = await retry.svc.decidePromotion(f.ids.promotionId, { decision: 'PROMOTE' }, f.users.supervisor);
    assert.equal(decided.status, 'PROMOTED');
    assert.equal((await decisionAudits(f)).length, 1);
  });

  // ---------------------------------------------------------------------------------------------
  // Sanity: the harness itself must be able to see a real block (guards against vacuous passes)
  // ---------------------------------------------------------------------------------------------

  it('0. Harness self-check: a second connection really is blocked by an open row lock (pg_blocking_pids), and clones are isolated', T, async () => {
    const f = await newFixture('selfcheck');
    const other = await newFixture('selfcheck_other');
    const holder = await f.actor('holder');
    const waiter = await f.actor('waiter');

    const h = hold(holder, lockRow('exam_results', f.ids.resultId));
    await h.acquired;
    const blocked = track(waiter.sql`update exam_results set score = '1.00' where id = ${f.ids.resultId}`.then(() => undefined));
    await waitBlockedBy(f.ctl, waiter, holder, 'self-check writer');
    assert.equal(blocked.settled(), false);
    await h.release('commit');
    await blocked.p;

    // Databases cloned from the same template do not share rows.
    const [mine] = await f.ctl`select score from exam_results where id = ${f.ids.resultId}`;
    const [theirs] = await other.ctl`select score from exam_results`;
    assert.equal(mine.score, '1.00');
    assert.equal(theirs.score, '65.00');
  });
});
