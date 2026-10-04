import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ImportJob } from '../../apps/api/src/imports/domain/entities/import-job.entity';
import { ImportResult } from '../../apps/api/src/imports/domain/entities/import-result.entity';

describe('Import Domain Entities & Lifecycle', () => {
  describe('ImportJob Entity', () => {
    it('should correctly handle state transitions and terminal states', () => {
      const pendingJob = new ImportJob(
        '11111111-1111-1111-1111-111111111111',
        'SHAHVAR_EXCEL',
        'PENDING',
        'class_export_2026.xlsx',
        '22222222-2222-2222-2222-222222222222',
        null,
        null,
        new Date(),
      );

      assert.equal(pendingJob.isPending(), true);
      assert.equal(pendingJob.isProcessing(), false);
      assert.equal(pendingJob.isTerminal(), false);
      assert.equal(pendingJob.canTransitionTo('PROCESSING'), true);
      assert.equal(pendingJob.canTransitionTo('CANCELLED'), true);
      assert.equal(pendingJob.canTransitionTo('FAILED'), true);
      assert.equal(pendingJob.canTransitionTo('COMPLETED'), false);

      const processingJob = new ImportJob(
        '11111111-1111-1111-1111-111111111111',
        'SHAHVAR_EXCEL',
        'PROCESSING',
        'class_export_2026.xlsx',
        '22222222-2222-2222-2222-222222222222',
        new Date(),
        null,
        new Date(),
      );

      assert.equal(processingJob.isProcessing(), true);
      assert.equal(processingJob.isTerminal(), false);
      assert.equal(processingJob.canTransitionTo('COMPLETED'), true);
      assert.equal(processingJob.canTransitionTo('COMPLETED_WITH_ERRORS'), true);
      assert.equal(processingJob.canTransitionTo('FAILED'), true);
      assert.equal(processingJob.canTransitionTo('PENDING'), false);

      const completedJob = new ImportJob(
        '11111111-1111-1111-1111-111111111111',
        'SHAHVAR_EXCEL',
        'COMPLETED',
        'class_export_2026.xlsx',
        '22222222-2222-2222-2222-222222222222',
        new Date(),
        new Date(),
        new Date(),
      );

      assert.equal(completedJob.isTerminal(), true);
      assert.equal(completedJob.canTransitionTo('PROCESSING'), false);
    });
  });

  describe('ImportResult Entity', () => {
    it('should correctly classify diagnostic status levels', () => {
      const successResult = new ImportResult(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        1,
        'SUCCESS',
        'Row matched successfully',
        new Date(),
      );
      assert.equal(successResult.isSuccess(), true);
      assert.equal(successResult.isError(), false);

      const errorResult = new ImportResult(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        2,
        'ERROR',
        'Missing required student last name',
        new Date(),
      );
      assert.equal(errorResult.isError(), true);
      assert.equal(errorResult.isWarning(), false);

      const warningResult = new ImportResult(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        3,
        'WARNING',
        'Created student without Shahvar code',
        new Date(),
      );
      assert.equal(warningResult.isWarning(), true);
      assert.equal(warningResult.isSuccess(), false);
    });
  });
});
