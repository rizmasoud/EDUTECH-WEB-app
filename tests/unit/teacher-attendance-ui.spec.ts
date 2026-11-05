import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const component = readFileSync(
  join(__dirname, '../../apps/web/components/scheduling/TeacherScheduleView.tsx'),
  'utf8',
);

describe('Teacher class session attendance workflow', () => {
  it('loads only the signed-in teacher session window through the sessions API', () => {
    assert.match(component, /\/sessions\?\$\{params\.toString\(\)\}/);
    assert.match(component, /startDate: localDateOffset\(-7\)/);
    assert.match(component, /endDate: localDateOffset\(45\)/);
  });

  it('loads the class roster through authorized enrollment and student endpoints', () => {
    assert.match(component, /getClassEnrollments\(session\.classId/);
    assert.match(component, /\/students\/\$\{enrollment\.studentId\}/);
  });

  it('supports every attendance status defined by the domain', () => {
    for (const status of ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']) {
      assert.match(component, new RegExp(status));
    }
  });

  it('submits one complete attendance batch for the selected session', () => {
    assert.match(component, /\/sessions\/\$\{selectedSession\.id\}\/attendance/);
    assert.match(component, /items: roster\.map/);
    assert.match(component, /Select an attendance status for every student before saving/);
  });

  it('does not allow teachers to overwrite an already-recorded attendance batch', () => {
    assert.match(component, /setAlreadyRecorded\(attendance\.length > 0\)/);
    assert.match(component, /disabled=\{alreadyRecorded \|\| saving \|\| !sessionOccurred\}/);
    assert.match(component, /!alreadyRecorded &&/);
    assert.match(component, /cannot overwrite it/);
  });

  it('filters the teacher timetable by the authenticated teacher id without a permissive fallback', () => {
    assert.match(component, /Boolean\(user\?\.teacherId\) && cls\.teacherId === user\?\.teacherId/);
    assert.doesNotMatch(component, /\|\| !user\?\.teacherId/);
  });

  it('discards stale roster/attendance responses when the selected session changes', () => {
    assert.match(component, /createLatestRequestGuard\(\)/);
    assert.match(component, /const token = requestGuard\.begin\(\)/);
    // Both the success path and the error path must check the token before touching state.
    assert.equal((component.match(/requestGuard\.isLatest\(token\)/g) ?? []).length >= 3, true);
    assert.match(component, /if \(!requestGuard\.isLatest\(token\)\) return;\s*\n\s*setRoster\(classRoster\)/);
    // Closing the panel invalidates in-flight requests; switching/closing is blocked while saving.
    assert.match(component, /requestGuard\.invalidate\(\)/);
    assert.match(component, /disabled=\{saving\}/);
  });

  it('keeps future sessions viewable but blocks attendance submission until the session has started', () => {
    assert.match(component, /hasSessionOccurred\(selectedSession\)/);
    assert.match(component, /disabled=\{saving \|\| attendanceLoading \|\| roster\.length === 0 \|\| !sessionOccurred\}/);
    assert.match(component, /This session has not started yet/);
    // handleSave must refuse even if the button were somehow triggered.
    assert.match(component, /if \(!hasSessionOccurred\(selectedSession\)\) \{\s*\n\s*setPanelError\(/);
    // Sessions are still listed and selectable regardless of date.
    assert.match(component, /onClick=\{\(\) => void openAttendance\(session\)\}/);
  });
});
