/**
 * Development demo data (explicit, opt-in). Used only by `pnpm db:seed:dev`
 * (scripts/db-seed-dev.ts); never run at application startup.
 *
 * Inserts roles, demo accounts (known demo passwords: development only), and a small
 * academic/class sample. It only inserts; it never updates, deletes or truncates.
 */
import { eq } from 'drizzle-orm';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { ScryptPasswordHasher } from '../../apps/api/src/auth/infrastructure/scrypt-password-hasher';

export async function seedDemoData(db: any) {
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
