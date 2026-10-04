import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionGenerationService } from '../../apps/api/src/sessions/application/services/session-generation.service';

describe('Sessions Generation Domain & Date Math', () => {
  // We can instantiate a minimal mock helper of the service to test date calculation pure logic
  const service = new SessionGenerationService(null);

  it('should generate all valid dates between term boundaries for a given day of the week', () => {
    // Range: 2026-04-15 (Wednesday) to 2026-04-30 (Thursday)
    // Day of week: 1 (Monday)
    // Mondays in this range: April 20, April 27
    const result = service.generateDatesForDay('2026-04-15', '2026-04-30', 1, false);
    
    assert.deepEqual(result, ['2026-04-20', '2026-04-27']);
  });

  it('should exclude Friday dates by default', () => {
    // Range: 2026-04-15 (Wednesday) to 2026-04-30 (Thursday)
    // Day of week: 5 (Friday)
    // Friday date: April 17, April 24
    // With excludeFridays = true (default)
    const resultWithExclusion = service.generateDatesForDay('2026-04-15', '2026-04-30', 5, true);
    assert.deepEqual(resultWithExclusion, []);

    // With excludeFridays = false
    const resultWithoutExclusion = service.generateDatesForDay('2026-04-15', '2026-04-30', 5, false);
    assert.deepEqual(resultWithoutExclusion, ['2026-04-17', '2026-04-24']);
  });

  it('should only generate dates exactly matching the schedule day of week', () => {
    // Range: 2026-04-01 (Wednesday) to 2026-04-07 (Tuesday)
    // Days in range: 
    // Apr 1 (Wed, 3), Apr 2 (Thu, 4), Apr 3 (Fri, 5), Apr 4 (Sat, 6), Apr 5 (Sun, 0), Apr 6 (Mon, 1), Apr 7 (Tue, 2)
    const sundays = service.generateDatesForDay('2026-04-01', '2026-04-07', 0, false);
    assert.deepEqual(sundays, ['2026-04-05']);

    const saturdays = service.generateDatesForDay('2026-04-01', '2026-04-07', 6, false);
    assert.deepEqual(saturdays, ['2026-04-04']);
  });

  it('should return an empty list if startDate is after endDate', () => {
    const result = service.generateDatesForDay('2026-05-01', '2026-04-01', 1, false);
    assert.deepEqual(result, []);
  });
});
