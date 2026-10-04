/**
 * Central Database Schema Registry
 *
 * Source of Truth: /Docs/database/database-specification.md
 * Phase 1: Domain & Database Foundation
 */

// Export enums
export * from './enums';

// Export table schemas
export * from './auth.schema';
export * from './teachers.schema';
export * from './students.schema';
export * from './institutes.schema';
export * from './academics.schema';
export * from './classes.schema';
export * from './attendance.schema';
export * from './education.schema';
export * from './substitutions.schema';
export * from './payroll.schema';
export * from './support.schema';
export * from './imports.schema';
export * from './system.schema';
export * from './scheduling.schema';

// Export relations
export * from './relations';

// Import all to construct the unified schema object for Drizzle client
import * as enums from './enums';
import * as auth from './auth.schema';
import * as teachers from './teachers.schema';
import * as students from './students.schema';
import * as institutes from './institutes.schema';
import * as academics from './academics.schema';
import * as classes from './classes.schema';
import * as attendance from './attendance.schema';
import * as education from './education.schema';
import * as substitutions from './substitutions.schema';
import * as payroll from './payroll.schema';
import * as support from './support.schema';
import * as imports from './imports.schema';
import * as system from './system.schema';
import * as scheduling from './scheduling.schema';
import * as relations from './relations';

export const schema = {
  ...enums,
  ...auth,
  ...teachers,
  ...students,
  ...institutes,
  ...academics,
  ...classes,
  ...attendance,
  ...education,
  ...substitutions,
  ...payroll,
  ...support,
  ...imports,
  ...system,
  ...scheduling,
  ...relations,
};
