import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../apps/api/src/infrastructure/database/schema';
import { importJobs, importResults } from '../../apps/api/src/infrastructure/database/schema/imports.schema';
import { accounts } from '../../apps/api/src/infrastructure/database/schema/auth.schema';
import { DrizzleImportJobRepository } from '../../apps/api/src/imports/infrastructure/drizzle-import-job.repository';
import { DrizzleImportResultRepository } from '../../apps/api/src/imports/infrastructure/drizzle-import-result.repository';
import { eq } from 'drizzle-orm';
import { applyMigrations } from '../helpers/migration-helper';

describe('Import Jobs & Results Database & Repository Integration Tests', () => {
  let pg: PGlite;
  let db: any;
  let jobRepo: DrizzleImportJobRepository;
  let resultRepo: DrizzleImportResultRepository;
  let accountId: string;

  before(async () => {
    pg = new PGlite();
    await applyMigrations(pg);

    db = drizzle(pg, { schema });
    jobRepo = new DrizzleImportJobRepository(db);
    resultRepo = new DrizzleImportResultRepository(db);

    const [account] = await db
      .insert(accounts)
      .values({
        personnelCode: 'SUP-01',
        passwordHash: 'dummy-hash',
        isActive: true,
      })
      .returning();
    accountId = account.id;
  });

  after(async () => {
    if (pg) {
      await pg.close();
    }
  });

  it('1. Create, find, and update ImportJob with status tracking', async () => {
    const job = await jobRepo.create({
      type: 'SHAHVAR_EXCEL',
      fileName: 'term1_classes.xlsx',
      createdBy: accountId,
      status: 'PENDING',
    });

    assert.ok(job.id);
    assert.equal(job.type, 'SHAHVAR_EXCEL');
    assert.equal(job.status, 'PENDING');
    assert.equal(job.fileName, 'term1_classes.xlsx');

    const found = await jobRepo.findById(job.id);
    assert.ok(found);
    assert.equal(found?.id, job.id);

    const now = new Date();
    const updated = await jobRepo.update(job.id, {
      status: 'PROCESSING',
      startedAt: now,
    });
    assert.equal(updated.status, 'PROCESSING');
    assert.ok(updated.startedAt);
  });

  it('2. Bulk insert and aggregation of row-level ImportResults', async () => {
    const job = await jobRepo.create({
      type: 'SHAHVAR_EXCEL',
      fileName: 'term2_classes.xlsx',
      createdBy: accountId,
    });

    await resultRepo.createMany([
      { importJobId: job.id, rowNumber: 1, status: 'SUCCESS', message: 'Row 1 valid' },
      { importJobId: job.id, rowNumber: 2, status: 'WARNING', message: 'Row 2 warning' },
      { importJobId: job.id, rowNumber: 3, status: 'ERROR', message: 'Row 3 invalid' },
      { importJobId: job.id, rowNumber: 4, status: 'SKIPPED', message: 'Row 4 skipped' },
    ]);

    const counts = await jobRepo.getResultsCount(job.id);
    assert.equal(counts.total, 4);
    assert.equal(counts.success, 1);
    assert.equal(counts.warning, 1);
    assert.equal(counts.error, 1);
    assert.equal(counts.skipped, 1);

    const resultsList = await resultRepo.findAllByJobId(job.id, { page: 1, pageSize: 10 });
    assert.equal(resultsList.total, 4);
    assert.equal(resultsList.items.length, 4);
  });

  it('3. Cascade deletion of ImportResults when ImportJob is deleted', async () => {
    const job = await jobRepo.create({
      type: 'SHAHVAR_EXCEL',
      fileName: 'temp.xlsx',
      createdBy: accountId,
    });

    await resultRepo.createMany([
      { importJobId: job.id, rowNumber: 1, status: 'SUCCESS', message: 'Row 1' },
    ]);

    // Delete job
    await db.delete(importJobs).where(eq(importJobs.id, job.id));

    // Results must be cascade deleted
    const res = await resultRepo.findAllByJobId(job.id);
    assert.equal(res.total, 0);
  });
});
