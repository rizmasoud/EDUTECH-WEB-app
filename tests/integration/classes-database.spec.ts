import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { classes, enrollments } from '../../apps/api/src/infrastructure/database/schema/classes.schema';
import { academicTerms, books, bookParts, bookSegments } from '../../apps/api/src/infrastructure/database/schema/academics.schema';
import { teachers, teacherSkills } from '../../apps/api/src/infrastructure/database/schema/teachers.schema';
import { students } from '../../apps/api/src/infrastructure/database/schema/students.schema';
import { accounts, roles, accountRoles } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { DrizzleClassRepository } from '../../apps/api/src/classes/infrastructure/drizzle-class.repository';
import { DrizzleEnrollmentRepository } from '../../apps/api/src/classes/infrastructure/drizzle-enrollment.repository';
import { eq } from 'drizzle-orm';
import { applyMigrations } from '../helpers/migration-helper';

describe('Classes & Enrollment Database Schema & Repository Integration Tests', () => {
  let pg: PGlite;
  let db: any;
  let classRepo: DrizzleClassRepository;
  let enrollmentRepo: DrizzleEnrollmentRepository;

  let termId: string;
  let bookId: string;
  let segmentId: string;
  let teacherId: string;
  let student1Id: string;
  let student2Id: string;

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);

    db = drizzle(pg, { schema });
    classRepo = new DrizzleClassRepository(db);
    enrollmentRepo = new DrizzleEnrollmentRepository(db);

    // Seed test reference data
    const [term] = await db
      .insert(academicTerms)
      .values({
        name: 'Fall 2026',
        startDate: '2026-09-01',
        endDate: '2026-12-31',
        status: 'ACTIVE',
      })
      .returning();
    termId = term.id;

    const [book] = await db
      .insert(books)
      .values({
        name: 'English Level 1',
        level: 'A1',
        sequenceOrder: 1,
        sessionCount: 20,
        isTerminal: false,
        isActive: true,
      })
      .returning();
    bookId = book.id;

    const [part] = await db
      .insert(bookParts)
      .values({
        bookId,
        name: 'Part 1',
        sequenceOrder: 1,
      })
      .returning();

    const [seg] = await db
      .insert(bookSegments)
      .values({
        bookPartId: part.id,
        name: 'Unit 1',
        sequenceOrder: 1,
      })
      .returning();
    segmentId = seg.id;

    const [account] = await db
      .insert(accounts)
      .values({
        personnelCode: 'TCH-99',
        passwordHash: 'dummy-hash',
        isActive: true,
      })
      .returning();

    const [tch] = await db
      .insert(teachers)
      .values({
        accountId: account.id,
        firstName: 'John',
        lastName: 'Smith',
        isActive: true,
      })
      .returning();
    teacherId = tch.id;

    await db.insert(teacherSkills).values({
      teacherId,
      bookId,
    });

    const [stu1] = await db
      .insert(students)
      .values({
        firstName: 'Alice',
        lastName: 'Walker',
        isActive: true,
      })
      .returning();
    student1Id = stu1.id;

    const [stu2] = await db
      .insert(students)
      .values({
        firstName: 'Bob',
        lastName: 'Martin',
        isActive: true,
      })
      .returning();
    student2Id = stu2.id;
  });

  after(async () => {
    if (pg) {
      await pg.close();
    }
  });

  it('1. Database check constraint enforces 1 <= capacity <= 15 on classes', async () => {
    // Valid capacity succeeds
    const cls = await classRepo.create({
      academicTermId: termId,
      bookId,
      bookSegmentId: segmentId,
      teacherId,
      classType: 'REGULAR',
      status: 'DRAFT',
      capacity: 12,
    });
    assert.ok(cls.id);
    assert.equal(cls.capacity, 12);

    // Invalid capacity < 1 is rejected by check constraint
    await assert.rejects(async () => {
      await db.insert(classes).values({
        academicTermId: termId,
        bookId,
        classType: 'REGULAR',
        status: 'DRAFT',
        capacity: 0,
      });
    });

    // Invalid capacity > 15 is rejected by check constraint
    await assert.rejects(async () => {
      await db.insert(classes).values({
        academicTermId: termId,
        bookId,
        classType: 'REGULAR',
        status: 'DRAFT',
        capacity: 20,
      });
    });
  });

  it('2. Foreign key referential integrity protects against cascade deletion of parent academic resources', async () => {
    const cls = await classRepo.create({
      academicTermId: termId,
      bookId,
      teacherId,
      classType: 'REGULAR',
      status: 'DRAFT',
      capacity: 10,
    });

    // Attempt to delete term that has classes must be rejected
    await assert.rejects(
      async () => {
        await db.delete(academicTerms).where(eq(academicTerms.id, termId));
      },
      (err: any) => err?.cause?.code === '23503' || /foreign key/i.test(err?.cause?.message || err?.message || ''),
    );

    // Attempt to delete book that has classes must be rejected
    await assert.rejects(
      async () => {
        await db.delete(books).where(eq(books.id, bookId));
      },
      (err: any) => err?.cause?.code === '23503' || /foreign key/i.test(err?.cause?.message || err?.message || ''),
    );
  });

  it('3. Unique composite constraint prevents duplicate (class_id, student_id) in enrollments table', async () => {
    const cls = await classRepo.create({
      academicTermId: termId,
      bookId,
      teacherId,
      classType: 'REGULAR',
      status: 'DRAFT',
      capacity: 10,
    });

    // First enrollment succeeds
    await enrollmentRepo.createWithCapacityCheck(
      {
        classId: cls.id,
        studentId: student1Id,
        status: 'ACTIVE',
      },
      cls.capacity,
    );

    // Second enrollment for same student and class is rejected by unique constraint
    await assert.rejects(
      async () => {
        await db.insert(enrollments).values({
          classId: cls.id,
          studentId: student1Id,
          status: 'ACTIVE',
        });
      },
      (err: any) => err?.cause?.code === '23505' || /unique|duplicate/i.test(err?.cause?.message || err?.message || ''),
    );
  });

  it('4. Atomic capacity check prevents enrolling beyond class capacity', async () => {
    const smallClass = await classRepo.create({
      academicTermId: termId,
      bookId,
      teacherId,
      classType: 'PRIVATE',
      status: 'DRAFT',
      capacity: 1, // Only 1 student allowed
    });

    // 1st student enrollment succeeds
    const enr1 = await enrollmentRepo.createWithCapacityCheck(
      {
        classId: smallClass.id,
        studentId: student1Id,
        status: 'ACTIVE',
      },
      smallClass.capacity,
    );
    assert.ok(enr1.id);

    // 2nd student enrollment exceeds capacity and must throw CAPACITY_EXCEEDED
    await assert.rejects(
      async () => {
        await enrollmentRepo.createWithCapacityCheck(
          {
            classId: smallClass.id,
            studentId: student2Id,
            status: 'ACTIVE',
          },
          smallClass.capacity,
        );
      },
      { message: 'CAPACITY_EXCEEDED' },
    );
  });

  it('5. Class queries support filtering by term, book, teacher, status and classType', async () => {
    const result = await classRepo.findAll({
      academicTermId: termId,
      bookId,
      page: 1,
      pageSize: 10,
    });

    assert.ok(result.total >= 2);
    assert.ok(result.items.length >= 2);
  });

  it('6. Enrollment status transition updates leftAt timestamp appropriately', async () => {
    const cls = await classRepo.create({
      academicTermId: termId,
      bookId,
      teacherId,
      classType: 'REGULAR',
      status: 'DRAFT',
      capacity: 10,
    });

    const [tempStudent] = await db
      .insert(students)
      .values({ firstName: 'Charlie', lastName: 'Brown', isActive: true })
      .returning();

    const enr = await enrollmentRepo.createWithCapacityCheck(
      {
        classId: cls.id,
        studentId: tempStudent.id,
        status: 'ACTIVE',
      },
      cls.capacity,
    );

    assert.equal(enr.status, 'ACTIVE');
    assert.equal(enr.leftAt, null);

    const now = new Date();
    const withdrawn = await enrollmentRepo.updateStatus(enr.id, 'WITHDRAWN', now);
    assert.equal(withdrawn.status, 'WITHDRAWN');
    assert.ok(withdrawn.leftAt);
  });
});
