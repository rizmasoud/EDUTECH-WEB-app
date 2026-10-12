import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { ScryptPasswordHasher } from '../../auth/infrastructure/scrypt-password-hasher';
import { parseBooleanFlag } from './driver-selection';

/**
 * Embedded PGlite bootstrap (development / preview only).
 *
 * Safety guarantees:
 *  - Nothing is applied or seeded unless explicitly enabled
 *    (PGLITE_AUTO_MIGRATE=true / PGLITE_SEED_DEMO=true).
 *  - Storage is NEVER deleted or reset, whatever a query returns.
 *  - If the schema is not present the function fails with a clear message.
 */
export interface PGliteBootstrapOptions {
  /** Filesystem directory, or "memory://" for an in-memory database. */
  dataDir: string;
  /** Replay every SQL file in migrationsDir (legacy, untracked, dev-only). */
  autoMigrate: boolean;
  /** Insert demo accounts/data when the accounts table is empty. */
  seedDemo: boolean;
  migrationsDir: string;
}

export const MEMORY_DATA_DIR = 'memory://';

export function readPGliteOptionsFromEnv(
  env: Record<string, string | undefined>,
  cwd: string = process.cwd(),
): PGliteBootstrapOptions {
  const raw = env.PGLITE_DATA_DIR?.trim();
  const dataDir =
    !raw ? path.resolve(cwd, '.pglite-storage') : raw.toLowerCase() === 'memory' ? MEMORY_DATA_DIR : path.resolve(cwd, raw);
  return {
    dataDir,
    autoMigrate: parseBooleanFlag('PGLITE_AUTO_MIGRATE', env.PGLITE_AUTO_MIGRATE),
    seedDemo: parseBooleanFlag('PGLITE_SEED_DEMO', env.PGLITE_SEED_DEMO),
    migrationsDir: path.resolve(cwd, 'apps/api/drizzle'),
  };
}

async function replayMigrations(pg: PGlite, migrationsDir: string): Promise<void> {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`PGLITE_AUTO_MIGRATE=true but migrations directory not found: ${migrationsDir}`);
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      await pg.exec(sqlContent);
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        console.warn(`Migration notice for ${file}:`, err.message);
      }
    }
  }
}

async function hasAccountsTable(pg: PGlite): Promise<boolean> {
  const res = await pg.query<{ present: boolean }>(`select to_regclass('public.accounts') is not null as present`);
  return Boolean(res.rows[0]?.present);
}

/**
 * Open a PGlite database according to explicit options. Never deletes storage.
 * The caller owns the returned `pg` handle (call pg.close() when done, e.g. in tests).
 */
export async function openPGliteDatabase(
  options: PGliteBootstrapOptions,
): Promise<{ db: any; pg: PGlite }> {
  const pg = new PGlite(options.dataDir);
  try {
    await pg.waitReady;
    if (options.autoMigrate) {
      console.warn(
        'PGLITE_AUTO_MIGRATE=true: replaying all SQL migrations without tracking (development only).',
      );
      await replayMigrations(pg, options.migrationsDir);
    }

    if (!(await hasAccountsTable(pg))) {
      throw new Error(
        'PGlite database has no schema (table "accounts" is missing). Nothing was applied or reset. ' +
          'To create the schema in a development database set PGLITE_AUTO_MIGRATE=true explicitly; ' +
          'see docs/migrations.md.',
      );
    }

    const db = drizzle(pg, { schema });

    if (options.seedDemo) {
      const existing = await db.select().from(schema.accounts).limit(1);
      if (existing.length === 0) {
        await seedDemoData(db);
      }
    }
    return { db, pg };
  } catch (err) {
    try {
      await pg.close();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

let cachedDb: any = null;

export async function getPGliteDatabase(): Promise<any> {
  if (cachedDb) return cachedDb;
  const { db } = await openPGliteDatabase(readPGliteOptionsFromEnv(process.env));
  cachedDb = db;
  return db;
}

async function seedDemoData(db: any) {
  console.log('Seeding initial EduTech demo data for preview environment...');
  const hasher = new ScryptPasswordHasher();

  // Roles
  const [supRole] = await db
    .insert(schema.roles)
    .values({ name: 'SUPERVISOR' })
    .onConflictDoNothing()
    .returning();
  const [tchRole] = await db
    .insert(schema.roles)
    .values({ name: 'TEACHER' })
    .onConflictDoNothing()
    .returning();

  const supRoleId = supRole?.id || (await db.select().from(schema.roles).where(eq(schema.roles.name, 'SUPERVISOR')))[0]?.id;
  const tchRoleId = tchRole?.id || (await db.select().from(schema.roles).where(eq(schema.roles.name, 'TEACHER')))[0]?.id;

  // Accounts
  const supHash = await hasher.hash('SupervisorPass123!');
  const [supAccount] = await db
    .insert(schema.accounts)
    .values({
      personnelCode: 'SUP-01',
      passwordHash: supHash,
      isActive: true,
    })
    .returning();

  if (supRoleId) {
    await db.insert(schema.accountRoles).values({
      accountId: supAccount.id,
      roleId: supRoleId,
    });
  }

  const tchHash = await hasher.hash('TeacherPass123!');
  const [tchAccount] = await db
    .insert(schema.accounts)
    .values({
      personnelCode: 'TCH-01',
      passwordHash: tchHash,
      isActive: true,
    })
    .returning();

  if (tchRoleId) {
    await db.insert(schema.accountRoles).values({
      accountId: tchAccount.id,
      roleId: tchRoleId,
    });
  }

  // Teacher profile
  const [t1] = await db
    .insert(schema.teachers)
    .values({
      accountId: tchAccount.id,
      firstName: 'Hamid',
      lastName: 'Souriyan',
      baseRate: '150.00',
      isActive: true,
    })
    .returning();

  // Academic term
  const [term] = await db
    .insert(schema.academicTerms)
    .values({
      name: 'Spring 2026',
      startDate: '2026-04-15',
      endDate: '2026-07-15',
      status: 'ACTIVE',
    })
    .returning();

  // Books
  const [b1] = await db
    .insert(schema.books)
    .values({
      name: 'English Level 1',
      level: 'A1',
      sequenceOrder: 1,
      sessionCount: 20,
      isTerminal: false,
      isActive: true,
    })
    .returning();

  const [b2] = await db
    .insert(schema.books)
    .values({
      name: 'English Level 2',
      level: 'A2',
      sequenceOrder: 2,
      sessionCount: 20,
      isTerminal: false,
      isActive: true,
    })
    .returning();

  const [b3] = await db
    .insert(schema.books)
    .values({
      name: 'Advanced Business English',
      level: 'C1',
      sequenceOrder: 6,
      sessionCount: 15,
      isTerminal: true,
      isActive: true,
    })
    .returning();

  // Students
  const [s1] = await db
    .insert(schema.students)
    .values({
      firstName: 'Ali',
      lastName: 'Rezaei',
      shahvarCode: 'S-1001',
      isActive: true,
    })
    .returning();

  const [s2] = await db
    .insert(schema.students)
    .values({
      firstName: 'Sara',
      lastName: 'Ahmadi',
      shahvarCode: 'S-1002',
      isActive: true,
    })
    .returning();

  const [s3] = await db
    .insert(schema.students)
    .values({
      firstName: 'Reza',
      lastName: 'Karimi',
      shahvarCode: 'S-1003',
      isActive: true,
    })
    .returning();

  // Teacher skills
  await db.insert(schema.teacherSkills).values([
    { teacherId: t1.id, bookId: b1.id },
    { teacherId: t1.id, bookId: b2.id },
  ]);

  // Classes
  const [c1] = await db
    .insert(schema.classes)
    .values({
      academicTermId: term.id,
      bookId: b1.id,
      teacherId: t1.id,
      classType: 'REGULAR',
      status: 'ACTIVE',
      capacity: 12,
    })
    .returning();

  const [c2] = await db
    .insert(schema.classes)
    .values({
      academicTermId: term.id,
      bookId: b2.id,
      teacherId: t1.id,
      classType: 'REGULAR',
      status: 'ACTIVE',
      capacity: 12,
    })
    .returning();

  const [c3] = await db
    .insert(schema.classes)
    .values({
      academicTermId: term.id,
      bookId: b3.id,
      classType: 'REGULAR',
      status: 'DRAFT',
      capacity: 10,
    })
    .returning();

  // Enrollments
  await db.insert(schema.enrollments).values([
    { classId: c1.id, studentId: s1.id, status: 'ACTIVE' },
    { classId: c1.id, studentId: s2.id, status: 'ACTIVE' },
    { classId: c1.id, studentId: s3.id, status: 'ACTIVE' },
    { classId: c2.id, studentId: s1.id, status: 'ACTIVE' },
  ]);

  // Initial Schedule for Class 1 (Sunday 08:00 - 09:30)
  await db.insert(schema.schedules).values({
    classId: c1.id,
    dayOfWeek: 0, // Sunday
    startTime: '08:00',
    endTime: '09:30',
  });

  console.log('Initial EduTech demo data seeded successfully!');
}
