import fs from 'node:fs';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/**
 * Sequentially loads and executes all database migration SQL files from apps/api/drizzle
 * on the provided PGlite database instance.
 */
export async function applyMigrations(pg: PGlite): Promise<void> {
  const dir = path.resolve(process.cwd(), 'apps/api/drizzle');
  if (!fs.existsSync(dir)) {
    throw new Error(`Migrations directory not found at ${dir}`);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (files.length === 0) {
    throw new Error(`No migration SQL files found in ${dir}`);
  }

  for (const file of files) {
    const sqlContent = fs.readFileSync(path.join(dir, file), 'utf-8');
    await pg.exec(sqlContent);
  }
}
