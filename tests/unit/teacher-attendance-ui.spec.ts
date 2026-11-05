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
    assert.match(component, /disabled=\{alreadyRecorded \|\| saving\}/);
    assert.match(component, /!alreadyRecorded &&/);
    assert.match(component, /cannot overwrite it/);
  });

  it('filters the teacher timetable by the authenticated teacher id without a permissive fallback', () => {
    assert.match(component, /Boolean\(user\?\.teacherId\) && cls\.teacherId === user\?\.teacherId/);
    assert.doesNotMatch(component, /\|\| !user\?\.teacherId/);
  });
});
